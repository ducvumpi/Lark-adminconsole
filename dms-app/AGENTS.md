<!-- BEGIN:base-app (managed by base-database-cli) -->
## Base App 平台指引
当前工程：workspace（配置版本 2）。
新建工程仅支持 workspace（init）；classic 仅供存量兼容，不自动迁移。
当前已安装 SDK：@lark-base-open/base-database-app-sdk@0.3.2。
写代码前先读工程内 node_modules/@lark-base-open/base-database-app-sdk/docs/README.md、node_modules/@lark-base-open/base-database-app-sdk/docs/start-base-app.md、node_modules/@lark-base-open/base-database-app-sdk/docs/components.md、node_modules/@lark-base-open/base-database-app-sdk/docs/page.md、node_modules/@lark-base-open/base-database-app-sdk/docs/compat.md、node_modules/@lark-base-open/base-database-app-sdk/docs/server.md；API 用法以已安装版本为准，建模与交付流程见 lark-base-database Skill。
仅在用户显式选择本地开发或迁移时执行 dev。开始前确认 SDK 已安装，且 page/index.html 指向的页面入口经 SDK startBaseApp(options) 启动；classic 旧工程按 Skill 的 workspace 迁移或手动迁移页面 helper 说明接入 SDK。CLI 在启动 Vite 前静态检查；需明确绕过时可传 --skip-bootstrap-check。开发用 base-database-cli dev（入口 /baseapp/dev/<siteToken>/<port>#t=<配对令牌>）；用 CLI 输出的完整链接打开；复制地址栏链接给别人会自动打开线上版本。若弹出或地址栏出现访问本地网络/本机设备请求，请允许后点重试。配对通过后核对本地调试提示条中的身份与数据范围。CLI 不创建服务端开发会话。FaaS 默认只构建，显式 --deploy-preview 才整应用发布 preview（共享草稿，提交时校验草稿基线）；Database Function、Mutation、AI Function、binding 或依赖变化需单独检查并执行整应用 deploy。dev.listening 仅代表监听，dev.ready 表示 SDK lifecycle 成功且 localOrigin 匹配的观察；连接前核对本人身份与 Base/表/写入范围。
server/、server-functions/ 或 contract 变化后先运行 base-database-cli contracts generate，再运行 base-database-cli check --json，再用 base-database-cli deploy 生成 Preview；浏览器验证见 Skill 的 references/verification.md。
站点开放函数的发现、调用与 agent-tools 策略见已安装 Skill 的 references/agent-tools.md；交付回复以 references/release.md 为准。
退出自动维护：在 base-database.jsonc 设置 "managedAgentDocs": false，或删除本段标记（保留 .base-database-cli/state/managed-agent-docs.json 退出记录）。
<!-- END:base-app -->
