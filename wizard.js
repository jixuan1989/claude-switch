const inquirer = require('inquirer');
const { profileExists } = require('./config');

async function addProfileWizard() {
  const { name } = await inquirer.prompt([{
    type: 'input',
    name: 'name',
    message: 'Profile 名称（例如 official、yunyi、deepseek）:',
    validate: (input) => {
      if (!input.trim()) return '请输入名称';
      if (!/^[a-zA-Z0-9_-]+$/.test(input)) return '只能包含字母、数字、下划线和连字符';
      if (profileExists(input)) return `"${input}" 已存在`;
      return true;
    }
  }]);

  const { source } = await inquirer.prompt([{
    type: 'list',
    name: 'source',
    message: '配置来源:',
    choices: [
      { name: '快照当前生效的配置（适合保存当前官方/第三方状态）', value: 'current' },
      { name: '交互式创建新的第三方配置', value: 'interactive' },
    ]
  }]);

  if (source === 'current') {
    return { name: name.trim(), source: 'current' };
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'API Base URL (ANTHROPIC_BASE_URL):',
      validate: (input) => {
        if (!input.trim()) return '必填项';
        try { new URL(input); return true; } catch { return '请输入有效的 URL'; }
      }
    },
    {
      type: 'input',
      name: 'authToken',
      message: 'API Key / Auth Token (将设为 ANTHROPIC_AUTH_TOKEN):',
      validate: (input) => input.trim() ? true : '请输入认证凭据',
    },
    {
      type: 'input',
      name: 'model',
      message: '模型名称 (ANTHROPIC_MODEL，可选):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'sameModelForAll',
      message: '将此模型同时设为 Sonnet/Opus/Haiku/Reasoning 的默认值？',
      when: (ans) => !!ans.model.trim(),
      default: true,
    },
    {
      type: 'input',
      name: 'maxTokens',
      message: '最大输出 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS，可选):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'disableNonessential',
      message: '禁用非必要流量？(CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)',
      default: false,
    },
  ]);

  const env = {};
  env.ANTHROPIC_BASE_URL = answers.baseUrl.replace(/\/$/, '');
  env.ANTHROPIC_AUTH_TOKEN = answers.authToken.trim();

  const model = answers.model.trim();
  if (model) {
    env.ANTHROPIC_MODEL = model;
    if (answers.sameModelForAll) {
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
      env.ANTHROPIC_REASONING_MODEL = model;
    }
  }

  if (answers.maxTokens.trim()) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = answers.maxTokens.trim();
  }

  if (answers.disableNonessential) {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  }

  return { name: name.trim(), source: 'interactive', env, model: model || undefined };
}

module.exports = { addProfileWizard };
