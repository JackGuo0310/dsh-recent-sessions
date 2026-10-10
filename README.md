# dsh-recent-sessions

在 DSH 侧边栏工作区下方增加可折叠的「最近」分组，跨项目汇总近期会话；设置页名为「最近会话」。

## 功能

- **位置**：工作区浏览区之下、Settings 之上的侧边栏底部，接在 `sidebar.footer.action` 这个增补插槽里，不覆盖任何原有侧边栏区域。
- **汇总与排序**：跨全部工作区、排除归档与子智能体会话，按最近活动时间倒序，时间相同以会话 ID 稳定保序。
- **折叠**：点击「最近」标题折叠/展开。
- **排序入口**：标题右侧的排序按钮，目前只有「最新」一项，默认选中，为后续排序方式预留了位置。
- **条目表现**：标题、相对时间、运行转圈、待审批/待回答的亮点、选中态都复用原工作区会话行的判定与视觉（自有的类名前缀 + `--dsw-*` 主题 token，不依赖任何 DSH 内部模块）。
- **所属项目**：悬停会话显示所属工作区（项目）名称；键盘聚焦同样可读到（`aria-description`）。
- **默认 10 条**：超过后出现「展开其余 N 个会话」/「收起」，条数可在设置页修改。

## 设置页

「最近会话」页面包含：

1. **仓库标识**：构建时从本仓库 Git 读取的仓库名与 tag，不是写死的字符串。当前提交若恰好处于某个 tag 就显示该 tag，否则显示「未打标签（最近 tag 距离说明）」或短提交号；完全没有 Git 信息时显示「未知版本」，绝不伪造 tag。
2. **默认显示条数**：整数，范围 1–50，保存后立即在侧边栏生效。

偏好存在本插件 Loader 行的 `config` 里（`defaultCount` / `maxCount`），由 Host 的 `Config` schema 声明，所以用户覆盖能在插件升级后保留。

## 安装

```
dsh plugin --profile <profile> add D:\Github\dsh-sidetalk-latest
```

或在本会话内用 `plugin_manager` 的 `install_bundle`，target 传本目录的绝对路径。

安装后在 DSH 左侧栏工作区下方即可看到「最近」。插件页面标题见 Plugins 列表，图标为 `icon.svg`。

## 开发

```bash
npm run check          # 语法检查三个 JS 文件
npm run version:meta   # 重新生成 client.js 里的 Git 版本块
npm pack               # 打包前自动刷新版本块
```

### 版本块为什么内联在 client.js 里

DSH 浏览器的模块表只解析平台种子模块、已物化模块和已注册的包工厂；同步的 `require('./version-meta.js')`
不在其中，而相对路径只能走异步分块加载器。所以 Git 元数据由 `scripts/gen-version.mjs`
在构建时写进 `client/client.js` 中 `// dsh:version-meta:begin` 与 `// dsh:version-meta:end`
之间的标记区域，区域之外请勿手工编辑。`npm run version:meta -- --check`
可在 CI 中校验该区域是否与 Git 一致。

## 已知限制

- 运行中的子智能体不会单列一条状态说明：DSH 的全局会话状态源只提供运行中、待处理交互和完成提醒，
  子智能体数量由工作区浏览器自行从各工作区的目录推导。本插件沿用运行中转圈与待处理亮点。
- 折叠状态只保留在当前页面生命周期内，未做持久化。

## 许可

MIT