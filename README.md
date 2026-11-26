# Antigravity 对话导出

在 Google Antigravity Windows 桌面端的对话侧栏里，把当前本地会话保存为 Markdown。

- **另存为…** 打开 Windows 保存窗口，可以自选文件夹和 `.md` 文件名。
- **保存到桌面** 将 Markdown 保存到桌面的 `Antigravity_Exports` 文件夹。
- 导出包含用户消息和助手的文本回复，保留 Markdown 格式和代码块。

## 安装

1. 从 [Releases](../../releases/latest) 下载并解压 Windows ZIP。
2. 打开解压后的 `antigravity-chat-export` 文件夹，双击 `install.cmd`。
3. 在 Antigravity 的「自定义 → 已安装」里启用「对话导出」。
4. 打开目标会话，选择右上角「⋯ → 扩展 → 对话导出」，然后点击「另存为…」。

也可以下载本仓库的源码 ZIP，解压后运行 `install.cmd`。升级后关闭并重新启用插件，再打开导出面板。安装程序会备份已有版本。

## 会话数据

这是一个面向 Antigravity App 的 Sidecar 插件。它读取本地 SQLite 会话和 JSONL 转录文件，将 UTF-8 Markdown 写入所选位置。插件在本地处理会话数据。

会话解析已在 Antigravity 2.35.1 的本地会话文件上检查。当前版本面向 Windows。

## 许可

[MIT](LICENSE)。参考项目和版权声明见 [第三方声明](THIRD-PARTY-NOTICES.md)。
