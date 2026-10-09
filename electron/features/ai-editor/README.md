# AI 导拍与剪辑领域

页面入口为 `src/pages/ProjectsPage.tsx`，提供统一的“项目”列表，按类型管理拍摄计划与剪辑工程；项目详情仍由 `director-lab` 和 AI 剪辑工作区分别负责。拍摄计划目录中的本地素材进入 AI 剪辑共享素材目录，并通过稳定 `mediaId` 引用。全局 Agent 面板仍是唯一聊天界面。

- `aiEditorLocalMediaService.ts`：发现本地照片/视频/音频、分配稳定 mediaId，并读取真实素材。
- `aiEditorMediaAnalysisService.ts` / `aiEditorSpeechService.ts`：按请求抽帧、生成联络表和语音识别；调用结果只表达实际返回的观察。
- `footageSelectionService.ts`：保存整体点赞/决定、评论、标签、点赞点、片段范围和锁定状态；使用 revision 并发控制。
- `aiEditorProjectService.ts`：保存 `LunaEditProject`，保留可选的 `directorPlanId` 关联，并校验素材 ID、源区间、效果参数和工程 revision；素材路径始终由主进程从本地 catalog 解析。
- `aiEditingToolModule.ts`：提供标注读取、剪辑工程创建/批量编辑、配乐生成、滤镜/水印发现和任务撤销工具，并承接 App 当前 `footage-creation` 与 `editing-workspace` 技能。
- `aiEditorExportService.ts`：在不更换 `luna-render-core` 的前提下预处理变速/照片运动/淡出片段，合成画面并混合原声与配乐。
- `footageSelectionService.ts`：保存素材点赞、评论、标签、时间点、范围与锁定状态。

工作台数据目录为 `baseDir/ai-editor-projects/` 和 `baseDir/footage-selection-projects/`。拍摄计划由 `director-lab` 管理，剪辑工程引用同一素材 catalog，但各自保留不同的项目数据结构和同步协议。
