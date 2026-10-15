# 验证与发布

版本：1.0.0-rc.14。适配目标：Apple Silicon、macOS 13+、ChatGPT Desktop 的 Codex 模式。当前本机官方应用版本为 26.1007.30912；其他版本与 Chat/Work 模式未验证。

## 本地已经检查

- Node 测试：源资产完整性、独立帧调度、性能像素预算、材质和主题语义、上游设置边界。
- Swift 原生编译通过；严格 code-sign 验证通过，签名类型为 ad-hoc。
- 安装到隔离临时目录、重复覆盖更新、拒绝覆盖其他应用目录。
- 原生启动模式和重复点击决策测试；Dock 添加、去重、移除和保留原图标及顺序模型测试。
- 仅连接自建本机协议模拟器：原生 WebSocket 握手、较大消息、事件过滤、响应匹配、协议错误、取消请求和超时处理。
- 原生应用不包含 Node/Electron 运行时或官方应用副本。
- 已在本机安装个人八效果包并核验签名和资源哈希；原生安装与可选说明插件注册分离。卸载可清理已注册的说明插件。
- 外部工具调用设定超时，原生安装在后台执行，避免第三方 CLI 阻塞界面。

## rc.14 语音触发 TCC 终止

本机两份最新 ChatGPT 崩溃报告（2026-10-15 11:23、11:28，Asia/Shanghai）均显示 SIGABRT，termination namespace=TCC，原因明确为缺少 NSMicrophoneUsageDescription。parent/responsible process 均为 Code-Codex Mac；原版 ChatGPT 已有此键，rc.13 启动器实际安装包没有。直接启动官方可用与这一责任归属差异一致。未将用户含糊描述的“自动补全输出”擅自认定为文本候选列表；已记录的两次崩溃均为麦克风用途说明问题。

[Apple 的 macOS 媒体授权文档](https://developer.apple.com/documentation/bundleresources/requesting-authorization-for-media-capture-on-macos)说明缺少用途声明会导致系统终止。本次只给启动器添加非空麦克风用途文案，未修改官方应用、现有启动架构、TCC 数据库或授权状态。当前管理器是无 Hardened Runtime 的 ad-hoc 构建；官方 GPT 自身已有 audio-input entitlement，此修复不额外添加 entitlement。

构建时 --self-test 读取实际 Bundle.main 的用途说明并拒绝空值；公开与个人包均经过此检查。签名／归档／安装后再读各自的 Info.plist 核验，原版 GPT 签名与文件哈希保持原样。没有自动打开语音、录音、操作系统权限对话框或关闭当前 GPT；本次不能据此宣称真实麦克风录音已通过。首次语音授权仍由使用者选择。

## rc.13 首页 Portal 叠色与直角

用户实际截图仍有叠色和直角，因此 rc.11/rc.12 的简化 Home fixture 不能证明真实首页已适配。重新静态核对本机 26.1007.30912：HomeComposerOverlay 通过 body Portal 渲染；浮层内部有 data-floating-chat-surface=true 与 data-right-panel-composer-overlay-content=true，Home 文件栏可以是 Root 的同级节点。旧几何条件只接受 main 的 DOM 后代且只查 Root 内 rail，故漏掉此路径。官方 Root 的默认圆角为0，圆角和 corner-shape 实际定义在 Body；旧共享底板的 inherit 因此也是0。

新 Portal 接管需要 fresh SurfacePolicy.validateRoot 对唯一主 main/frame 通过，同时要求精确原生锚点、唯一 Home Root 和 present 文件栏。只给局部共同父节点赋材质 scope，保留 app/frame/main/viewport、缩放、宽度和向外扩展限位，不给 body、section 或整个 fixed layer 着色。父节点原为 static 且带偏移时拒绝变更；普通 static 只建立局部定位，其他原生位置保留。关闭、隐藏/inert、主外壳失效和越界均归还租用属性与样式。

共同父节点的一块伪元素承载底色和磨砂；Root、Body、文件栏及原生阴影不再另画一层。圆角取原生 composer token 或 Body computed radius。Portal 只借用主题变量，不加通用 overlay 的底色标记。尺寸和位置使用合并事件与局部 ResizeObserver；祖先动画结束才复核最终位置，不采样每个动画帧。

新的 home-material 独立页面模拟 Root 内 Slot、widget 内兄弟栏以及 body Portal，Root 原生圆角为0，Body为22px，文件栏使用 present 属性与原生负 margin。对照已安装 rc.12 renderer，只将独立 localhost 测试入口的 eligibility flag 改为 preview=true，其外观代码不变：内 Slot 的 plate radius=0；兄弟栏与 Portal 的交叠 alpha=0.4375 且有重复阴影。候选三分支的 Body／文件／交叠点均为0.25、plate radius=22px、重复阴影为0；Portal 父节点无 generic overlay 标记。检查覆盖新增文件、隐藏/inert、主外壳撤销、半透明主题及恢复。

这些是原版 bundle 的静态结构核验与独立 CSS/几何回归，未读取或自动重载当前 GPT 的实际 DOM，真实窗口效果仍需用户在结束当前任务后启动新版验收；双显示器验收边界继续保留。

## rc.12 透明辅助窗口与多显示器事故

用户报告启动后另一显示器被动态背景覆盖、无法显示其他界面；完全退出并从原版 GPT 进入后已恢复。本次仅停止本项目的后台辅助进程，未自动关闭、重启或连接当前官方 GPT。

静态核对本机官方 bundle：主聊天和透明辅助窗口共用 index.html，初始路由由 initialRoute query 区分；screenOverlay、avatar、dictation 等窗口可置顶且具有透明原生表面。“electron”仅是运行平台，不是主窗口身份。旧 validTarget 接受所有 index.html，旧预置只凭共享 enabled 偏好给任意 #root 铺底。这是已确认的隔离缺陷；未读取事故当时的真实窗口目标，不能断言具体是哪一种辅助窗口。

独立 surface-scope 页面模拟相同源、相同启用偏好。使用已核验的已安装 rc.11 renderer，screen-overlay 场景无 renderer canvas 且未匹配主界面，#root 仍得到不透明渐变。rc.12 在同场景以及带完整假主界面结构的 avatar-overlay 场景均在入口拒绝：0 个背景节点、0 个适配样式、Root background-image 为 none。合法 URL 但只有裸 main 的页面同样不铺底；完整主外壳正常接入且只有一个背景节点。条纹模拟后方桌面，并非真实 macOS 第二显示器。

启动偏好先使用同一窗口判断，只在合法主页面写入并消耗启动标志；拒绝后不注册背景脚本。原生和脚本分别校验登记的主路由、URL/query、顶层上下文；DOM 阶段要求唯一、可见、viewport 内的 Root、frame 和主 main。只有经过验证的 Root 才适用预置CSS。先前验证过的主外壳可在短暂加载时保留，但 URL/身份/几何失效会撤销。Home 联合几何也必须位于已验证 Root 与 main 内，对缩放、向外扩展及总宽度设限；异常时不创建背板。DOM 就绪前重复注入只保留本轮策略，旧实例不能停止新策略；晚出现辅助路由会清理 pending 预置及变量。主外壳身份、可见性和尺寸变化通过事件与 ResizeObserver 再验证；撤销标记同时停止已存在的背景，运行期样式也要求验证标记。仅调色或自有 CSS 变量不会反复触发资格扫描。可见 main 越界不属于加载保留例外。

首页独立回归使用 viewport 内的实际外壳尺寸，上／下栏、增加一行及换位仍为单层0.25 alpha，未回退为叠层。小于模板最小高度的预览原先会超出 viewport；已改为受限尺寸，未放宽运行时安全门槛。

这些是静态代码、独立页面和模型回归。当前恢复的官方会话保持普通启动；本次不会自动激活候选。双显示器正常窗口、置顶辅助浮层、窗口拖动／全屏及后台行为尚未完成实际宿主验收。

## rc.11 首页文件栏整体材质

静态核对原生Home组装：Hosted Body包在relative层，文件/项目栏位于Home Root内的绝对UtilityBarSlot，可在Root之外的上方/下方并用负margin伸入Body。rc.10的直接Body child假设不成立，且data-composer-rail、rail-item和composer-surface-chrome未完整清理。

本次Home Root只承载一块伪元素底板，四个inset按Root和可见rail的联合矩形设置。内部Body、slot、rail/item及其伪元素不再绘制另一层底色、磨砂或阴影。观察仅由相关DOM、ResizeObserver、窗口尺寸及动画结束事件触发；关闭/恢复时还原原标记和CSS变量，保留按钮/弹窗子树。

独立home-material页面模拟真实绝对above/below Slot、包裹Body、附着负margin与原生prominent shadow。按输入区、文件栏区、交叠区的屏幕点检查，三处均只有shared plate的0.25 alpha，rail阴影为none，底板覆盖全部rail。增加文件行及上下换位也通过；暗色同一回归通过；恢复后Home owner标记和几何变量均清空。这是独立几何/CSS验证，不是正在运行的GPT逐像素验收。

## rc.10 残余闪底与输入区叠色

用户实际窗口仍有短暂闪底，说明rc.9简化回归未覆盖宿主所有层。静态核对本机官方bundle：FullHeightPageSurfaceLayout读独立app-color-background-shell，消息壳有局部primary/secondary变量，WorkspaceContent存在伪元素。composer布局属性同时位于Root、Body、Input与Footer；旧预置给嵌套层反复绘制25%底色。

新的transition-materials回归按上述结构模拟普通输入、Home Body、独立/嵌套工具条、超过600毫秒的加载、同root children与整个root替换。计算实际祖先背景的合成alpha和磨砂层数，并观察外壳及伪元素；这些仍是独立DOM/CSS模拟，不能代替实际GPT的逐像素确认。旧rc.9普通编辑与工具条合成alpha为0.5781，Home编辑为0.4375；修复为0.25，磨砂最多1层。不存在新增GPU读回或持续扫描，按钮与弹窗子树不由公共composer规则清底。

rc.9的“0原生实底样本”仅指当时的有限模板。rc.10使用补全的外壳、祖先与伪元素观测，不以旧结果宣称实际宿主问题已消失。

## rc.9 同窗口切换闪屏验证

用户确认范围是同一GPT窗口切换聊天或标签页。本次提前安装不依赖区域标记的CSS，随后保留原来的100毫秒合并扫描；对短暂缺失/重叠main保留原背景，同尺寸shell替换复用现有渲染器。未改新建macOS窗口的原生调试接入策略。

独立浏览器首绘制页面在head加载代码，延迟插入应用壳，模拟双main交接、main替换和整个root替换。亮色旧rc.8观察到67个原生实底RAF样式样本，暗色77个；修复后两种主题均为0，输入框alpha始终0.25。背景在同窗口交接阶段保持存在。计数仅为独立页面每次RAF读到的computed style，不能等同真实宿主窗口的逐像素绘制证明；实际聊天切换仍需用户加载新版验收。

新增12项生命周期回归：HTML/head尚不存在、关闭/移除/坏配置、DOM创建前状态更新、75%输入框透明度、八种轻量底图、变量与优先级恢复、重复注入，以及真实payload与native restore取消等待DOMContentLoaded的初始化。没有加入背景像素读取、每帧扫描或高速原生窗口轮询。

## rc.8 稳定文字与性能验证

取消逐背景亮度切换前景：中性文字固定白字加 0.55px 黑边，原生主题切换、新任务、新气泡和 inverse 行都保持固定前景。独立浏览器已核验描边宽度、颜色、代码与状态色、输入光标及25%底色（75%透明度），设置卡片与菜单透明且不创建镜像 canvas；恢复后所有适配标记移除，描边还原为0。

在同一独立合成页面、银河流光、1412×1326、DPR1、前台、64个任务、3秒预热/12秒采样条件下，旧rc.7与候选rc.8对照如下。两个运行无焦点/可见性变化与脚本错误；测量包含相同的页面计数开销。

| 指标 | rc.7 | rc.8 |
| --- | ---: | ---: |
| 静置适配/渲染回调 JS 工作（毫秒/秒） | 33.68 | 2.26 |
| 开菜单时 JS 工作（毫秒/秒） | 38.83 | 2.55 |
| 开菜单时背景读回次数 | 8 | 0 |
| 开菜单时背景镜像复制次数 | 264 | 0 |
| 开菜单时超过50毫秒的长任务 | 8 | 0 |
| 开菜单时装饰背景回调（次/秒） | 59.25 | 30.00 |

这些是单次合成浏览器运行的计数和JS耗时，不是实际GPT的总CPU/GPU/内存测试，也不代表所有背景或持续负载的百分比收益。新调度的120Hz显示模拟检查30帧/10秒时原生RAF唤醒从1200降至300，另有约299次定时器唤醒；90Hz平均帧率、暂停和取消也通过。隐藏页暂停逻辑仍保留，画质优先可选60帧；运行时去掉背景读回与弹窗复制。

## rc.7 安装更新验证

更新策略新增完整 SemVer、渠道及能力集合保护、逐层资源哈希校验和安装事务。原生自检在临时目录模拟入口登记失败并核对旧版还原；构建测试模拟三项输出替换故障、回滚失败保存备份和旧 ZIP 清理边界。旧副本清理限定已确认同应用身份、用户拥有、版本和背景集合可替代的可写路径，当前安装来源退出后再处理；官方 GPT 不参与清理。

本机已实际验证 CLI 安装来源退出后自动进入废纸篓；GUI 安装完成提示停留超过30秒时来源仍保留，点击完成退出后重试清理成功。当时安装为个人八背景 rc.7，Spotlight 与 Dock 均只有一个正式入口；公开与个人归档目录当时各仅保留 rc.7 ZIP。官方 GPT 签名检查通过，当前聊天未关闭。GUI 最初因宽泛目录枚举等待而停滞，已改为只查询本应用的已登记路径和显式安装来源，修正后GUI安装完成。

## rc.6 本机背景菜单修复验证

用户报告数量减少。本机 rc.5 的 channel/catalog 为 8，但打包 UI.effects 仅为公开版的 4，导致另外 4 个渲染器没有选择卡片。rc.6 同时从所选资产目录读取 UI 和渲染器，在打包前验证清单及面板；公共包仍为 4，本机个人包为 8。公开 CI 采用合法公开素材的三效果子集验证分离目录，不将私有资产纳入 CI。独立本机预览已核验八个卡片和设置面板，并启用极光观察持续帧绘制。当前字体、材质和性能代码未回退。

## rc.5 侧栏和用户消息修复验证

用户确认已从新版 Dock 入口重启，截图仍显示任务名及用户消息暗字。本次静态核对当前宿主的 sidebar-navigation/nav 局部 color-text 定义、sidebar-item 行和 data-user-message-bubble 专用前景。preview/conversation.html 使用这些结构，旧 rc.4 对照能复现暗字；修复后核验亮暗背景、项目和任务标题、用户消息、新增节点、仅补语义属性、inverse 行及恢复。绿色状态和现有代码配色策略保留，侧栏与气泡仍透明。

本次没有控制或重载当前 GPT 自身；已安装的修复包仍需完整重启后验收实际窗口。

## rc.4 设置页透明修复验证

rc.3 的模拟卡片采用 bg-background-elevated-primary，未复现宿主实际使用的内联 --color-background-panel 底色，不能据此证明实际设置页卡片适配通过。用户的新截图确认了该遗漏。rc.4 静态核对当前官方 bundle 的 group/settings、data-density、@container/settings-row 和分组底色，独立 preview/settings.html 使用这些结构和控件颜色变量，并核验卡片 computed background alpha = 0、控件局部配色及小面积底色自动增强、控件配色、开关状态、动态新增、节点复用、设置容器退出及恢复。

尚未在正在工作的 GPT 中自动重载本次修复；实际窗口效果须用户完全退出后重新从 Dock 入口启动确认。

控件模型的数学回归覆盖混合黑白、灰阶和彩色采样，最小控件底色及 hover 不降低最差采样对比度；此模型只保护控件采样范围，设置卡片仍保持完全透明，输入框仍为 75% 透明度。

## rc.3 主题修复验证

用户截图已确认实际窗口中的背景加载，以及亮色卡片、消息对比度和光标问题。rc.3 在独立浏览器回归页面核验亮色/暗色主题与亮色/深色背景组合、编辑区光标颜色、主题实时切换、设置卡片、消息、代码语法、弹窗及恢复。模型测试检查主文字的 4.5:1 对比度选择；实际复杂背景按区域缩略图估计并配以轻文字阴影，不能声称每个动画像素都满足该比值。没有在当前 GPT 会话中自动重载或关闭窗口；本次修复在实际宿主仍需重启验收。

## 尚待实际验收

rc.2 修正了窗口初始化时序，安装与设置页已能通过原生界面工具读取并截图。首次安装、后台安装状态、完成提示、卸载及重新安装均已实际操作。卸载后启动器与自身 Dock 项目消失，其余 30 个项目内容与顺序一致；重新安装后只有一个主题入口。用户已实际启动并提交背景截图；本次修复及下列完整生命周期仍需验收。

本次更新没有在正在工作的 GPT 上自动试运行，也没有关闭当前聊天。完成任务后由用户完全退出 GPT，再单击 Dock 的「GPT 动态背景」，检查：

1. Dock 单击启动和重复点击、设置窗口、安装、更新、恢复和卸载均正常；配套说明插件在目录可见。
2. GPT 登录与聊天正常，主界面、顶部、侧边栏、输入框、消息、代码块与弹窗材质符合预期。
3. 背景动态流畅，暂停、切换、设置与性能模式正常；原生文字保持清晰。
4. 恢复后刷新页面不会重新加载主题，卸载后原图标正常启动，macOS 壁纸始终保持原样。

独立模拟预览只验证适配器样式，不证明实际宿主行为。协议模拟测试只证明传输部分，不证明当前 GPT 对注入方式的兼容性。没有宣称测得实际总 CPU/GPU 节省。

## 稳定版发布条件

- 完成上述实际验收，记录 GPT 与 macOS 版本。
- 复核 LICENSE_STATUS 与所有再分发材料。
- 用 Developer ID 签名并完成 Apple notarization、staple 和 Gatekeeper 检查。
- 将版本号升级为稳定版，构建公开包，核对 SHA256SUMS；禁止上传 private/ 构建。
- 推送后的 GitHub Actions 必须实际通过；以本仓库 [checks 工作流](https://github.com/Boombroke/Code-Codex-mac/actions/workflows/ci.yml)中目标提交 SHA 对应的测试与 macOS 构建结果为准。
