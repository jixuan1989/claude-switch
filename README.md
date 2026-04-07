# claude-switch

Claude Code 配置 profile 切换工具。把官方和各个第三方供应商的全套配置文件保存为 profile 快照，切换时整体替换。

## 原理

Claude Code 的运行依赖这些配置文件：

| 文件 | 作用 |
|------|------|
| `~/.claude/settings.json` | env 环境变量、permissions、plugins |
| `~/.claude/config.json` | primaryApiKey（控制认证方式） |
| `~/.claude.json` | OAuth 账户信息、偏好设置 |
| `~/.claude/.credentials.json` | OAuth token（**仅 Linux**，macOS 存在 Keychain） |

本工具将这些文件作为一组快照保存到 `~/.claude-switch/profiles/<name>/`，切换时：

1. 先把当前生效的配置**回收**到当前 profile（保留你使用过程中的修改）
2. 再把目标 profile 的全套文件**拷贝**到生效位置

## 安装

```bash
cd claude-switch
npm install
npm link   # 可选，注册全局命令
```

## 快速开始

```bash
# 1. 先保存当前官方配置（确保已用 claude login 登录过）
claude-switch save official

# 2. 添加第三方供应商（交互式向导）
claude-switch add

# 3. 切换到第三方
claude-switch use yunyi

# 4. 切回官方
claude-switch use official
```

> 切换后需要重启 Claude Code 会话才能生效

## 命令

### `save <name>` — 快照当前配置

```bash
claude-switch save official    # 保存当前状态为 official
claude-switch save yunyi       # 已存在则覆盖更新
```

### `add` — 交互式添加 profile

两种方式：
- **快照当前配置** — 适合保存当前已经配好的状态
- **交互式创建** — 引导配置 Base URL、认证、模型等

### `use [name]` — 切换 profile

```bash
claude-switch use yunyi    # 直接指定
claude-switch use          # 交互式选择
```

切换时自动回收当前配置的修改到对应 profile。

### `list` — 列出所有 profile

```bash
claude-switch list
```

### `current` — 查看当前 profile

### `show <name>` — 查看 profile 快照内容

### `remove <name>` — 删除 profile

### `info` — 显示存储路径

## 存储结构

```
~/.claude-switch/
├── meta.json                    # 记录当前激活的 profile
└── profiles/
    ├── official/
    │   ├── settings.json
    │   ├── config.json
    │   ├── claude.json
    │   └── credentials.json     # 仅 Linux
    └── yunyi/
        ├── settings.json
        ├── config.json
        ├── claude.json
        └── credentials.json     # 仅 Linux
```

## 平台差异

| | macOS | Linux |
|---|---|---|
| OAuth token 存储 | macOS Keychain | `~/.claude/.credentials.json` |
| 管理的文件数 | 3 个 | 4 个（多 credentials.json） |
| 文件权限 | 默认 | credentials.json 保持 0600 |

工具会自动检测平台并调整管理的文件列表。
