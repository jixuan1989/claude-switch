#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const {
  listProfiles,
  profileExists,
  saveProfile,
  switchTo,
  removeProfile,
  getProfileFiles,
  getCurrentName,
  profileDir,
  MANAGED_FILES,
  PROFILES_DIR,
} = require('./config');
const { addProfileWizard } = require('./wizard');

function maskSecret(key, value) {
  if (key.includes('TOKEN') || key.includes('KEY') || key.includes('apiKey')) {
    return String(value).slice(0, 8) + '...';
  }
  return value;
}

program
  .name('claude-switch')
  .description('Claude Code 配置 profile 切换工具 — 整体快照/替换配置文件')
  .version('1.0.0');

program
  .command('save [name]')
  .description('将当前生效的配置快照保存为 profile')
  .action((name) => {
    if (!name) {
      console.error(chalk.red('\n✗ 请指定 profile 名称，例如: claude-switch save official\n'));
      process.exit(1);
    }
    if (profileExists(name)) {
      saveProfile(name);
      console.log(chalk.green(`\n✓ Profile "${name}" 已更新（覆盖保存）`));
    } else {
      saveProfile(name);
      console.log(chalk.green(`\n✓ Profile "${name}" 已创建`));
    }
    console.log(chalk.gray('  已快照:'));
    for (const file of MANAGED_FILES) {
      const exists = fs.existsSync(file.source);
      console.log(chalk.gray(`    ${file.name} ${exists ? '✓' : '(不存在，跳过)'}`));
    }
    console.log();
  });

program
  .command('add')
  .description('交互式添加新的 profile')
  .action(async () => {
    try {
      const result = await addProfileWizard();

      if (result.source === 'current') {
        saveProfile(result.name);
        console.log(chalk.green(`\n✓ Profile "${result.name}" 已创建（从当前配置快照）`));
      } else {
        const dir = profileDir(result.name);
        fs.mkdirSync(dir, { recursive: true });

        const settings = {
          env: result.env,
          permissions: { allow: ['WebFetch(*)'], deny: [] },
        };
        if (result.model) settings.model = result.model;
        fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));

        const config = { primaryApiKey: 'any' };
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));

        console.log(chalk.green(`\n✓ Profile "${result.name}" 已创建`));
        console.log(chalk.gray('  env:'));
        for (const [k, v] of Object.entries(result.env)) {
          console.log(chalk.gray(`    ${k} = ${maskSecret(k, v)}`));
        }
      }

      console.log(chalk.yellow(`\n提示: 使用 ${chalk.bold(`claude-switch use ${result.name}`)} 切换到此 profile\n`));
    } catch (e) {
      if (e.message?.includes('force closed')) process.exit(0);
      console.error(chalk.red(`\n✗ ${e.message}\n`));
      process.exit(1);
    }
  });

program
  .command('use [name]')
  .description('切换到指定 profile')
  .action(async (name) => {
    const inquirer = require('inquirer');
    try {
      const profiles = listProfiles();
      if (profiles.length === 0) {
        console.log(chalk.yellow('\n还没有任何 profile。'));
        console.log(chalk.yellow('先保存当前配置: claude-switch save official\n'));
        process.exit(0);
      }

      if (!name) {
        const current = getCurrentName();
        const choices = profiles.map(p => ({
          name: `${p} ${p === current ? chalk.green('(当前)') : ''}`,
          value: p,
        }));
        const ans = await inquirer.prompt([{
          type: 'list',
          name: 'profile',
          message: '选择 profile:',
          choices,
        }]);
        name = ans.profile;
      }

      const current = getCurrentName();
      switchTo(name);
      console.log(chalk.green(`\n✓ 已切换到: ${chalk.bold(name)}`));
      if (current && current !== name) {
        console.log(chalk.gray(`  (已将 ${current} 的当前状态回收保存)`));
      }

      const files = getProfileFiles(name);
      if (files?.['settings.json']?.env) {
        const env = files['settings.json'].env;
        const baseUrl = env.ANTHROPIC_BASE_URL;
        if (baseUrl) {
          console.log(chalk.gray(`  ANTHROPIC_BASE_URL = ${baseUrl}`));
        } else {
          console.log(chalk.gray('  官方模式（无第三方 env）'));
        }
      }

      console.log(chalk.yellow('\n⚠ 需要重启 Claude Code 会话才能生效\n'));
    } catch (e) {
      if (e.message?.includes('force closed')) process.exit(0);
      console.error(chalk.red(`\n✗ ${e.message}\n`));
      process.exit(1);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('列出所有 profile')
  .action(() => {
    const profiles = listProfiles();
    const current = getCurrentName();

    console.log(chalk.bold('\nProfile 列表:\n'));

    if (profiles.length === 0) {
      console.log(chalk.gray('  (空)'));
      console.log(chalk.gray('  先保存当前配置: claude-switch save official\n'));
      return;
    }

    for (const name of profiles) {
      const isCurrent = name === current;
      const prefix = isCurrent ? chalk.green('✓') : ' ';
      const label = isCurrent ? chalk.green.bold(name) : name;

      const files = getProfileFiles(name);
      let detail = '';
      if (files?.['settings.json']?.env?.ANTHROPIC_BASE_URL) {
        detail = chalk.gray(files['settings.json'].env.ANTHROPIC_BASE_URL);
      } else if (files?.['settings.json']) {
        const env = files['settings.json'].env || {};
        detail = Object.keys(env).length === 0 ? chalk.gray('(官方)') : '';
      }

      console.log(`  ${prefix} ${label} ${detail}`);
    }
    console.log();
  });

program
  .command('current')
  .description('查看当前生效的 profile')
  .action(() => {
    const current = getCurrentName();
    console.log(chalk.bold('\n当前 profile:\n'));

    if (!current) {
      console.log(chalk.yellow('  未记录。使用 save <name> 保存当前配置'));
    } else {
      console.log(`  ${chalk.green.bold(current)}`);

      const files = getProfileFiles(current);
      if (files?.['settings.json']?.env) {
        const env = files['settings.json'].env;
        if (env.ANTHROPIC_BASE_URL) {
          console.log(chalk.gray(`  URL: ${env.ANTHROPIC_BASE_URL}`));
          if (env.ANTHROPIC_MODEL) console.log(chalk.gray(`  模型: ${env.ANTHROPIC_MODEL}`));
        } else if (Object.keys(env).length === 0) {
          console.log(chalk.gray('  官方模式'));
        }
      }
      if (files?.['config.json']?.primaryApiKey) {
        console.log(chalk.gray(`  primaryApiKey: ${files['config.json'].primaryApiKey}`));
      }
    }
    console.log();
  });

program
  .command('show <name>')
  .description('查看 profile 的快照内容')
  .action((name) => {
    const files = getProfileFiles(name);
    if (!files) {
      console.error(chalk.red(`\n✗ Profile "${name}" 不存在\n`));
      process.exit(1);
    }

    console.log(chalk.bold(`\nProfile: ${name}\n`));

    for (const [filename, content] of Object.entries(files)) {
      console.log(chalk.cyan(`  ${filename}:`));
      if (!content) {
        console.log(chalk.gray('    (无法解析)'));
        continue;
      }
      const flat = JSON.stringify(content, null, 2).split('\n');
      for (const line of flat.slice(0, 30)) {
        let display = line;
        for (const secret of ['TOKEN', 'KEY', 'apiKey', 'Auth']) {
          if (line.includes(secret) && line.includes(':')) {
            display = line.replace(/: "(.{8})[^"]*"/, ': "$1..."');
          }
        }
        console.log(chalk.gray(`    ${display}`));
      }
      if (flat.length > 30) console.log(chalk.gray(`    ... (${flat.length - 30} more lines)`));
      console.log();
    }
  });

program
  .command('remove <name>')
  .alias('rm')
  .description('删除指定 profile')
  .action((name) => {
    try {
      const current = getCurrentName();
      if (name === current) {
        console.error(chalk.red(`\n✗ 不能删除当前生效的 profile "${name}"，请先切换到其他 profile\n`));
        process.exit(1);
      }
      removeProfile(name);
      console.log(chalk.green(`\n✓ Profile "${name}" 已删除\n`));
    } catch (e) {
      console.error(chalk.red(`\n✗ ${e.message}\n`));
      process.exit(1);
    }
  });

program
  .command('info')
  .description('显示存储路径')
  .action(() => {
    console.log(chalk.bold('\n路径信息:\n'));
    console.log(`  Profile 存储目录: ${chalk.cyan(PROFILES_DIR)}`);
    console.log(`  管理的文件:`);
    for (const file of MANAGED_FILES) {
      console.log(`    ${chalk.cyan(file.source)} → ${file.name}`);
    }
    console.log();
  });

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
