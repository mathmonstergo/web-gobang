# 弹窗 UI 优化 - PRD

## 目标

将所有弹窗提升到顶级 UI 设计水平，融入五子棋主题的精致效果（波纹、粒子、物理动画），打造独特的品牌体验。

## 核心需求

### 1. 视觉层次优化
- **清晰的文字层级**：标题近白色、正文高对比、标签大写
- **主次按钮强化**：主按钮有藏红花色光晕，次按钮明显更低调
- **系统化间距**：采用 8px 基准间距系统（4/8/12/16/20/24/32px）

### 2. 精致微动效
- **按钮交互**：Hover 2px 提升、Active 按压反馈、Disabled 去饱和
- **加载状态**：Spinner 动画（解决"创建中"无反馈问题）
- **错误/成功**：错误消息滑入、成功图标弹性弹入

### 3. 五子棋主题融合
- **按钮点击涟漪**：藏红花色粒子扩散（18-24 个粒子，420ms）
- **弹窗打开波纹**：背景遮罩从中心扩散的同心圆（280ms）
- **成功粒子庆祝**：房间创建成功时的小型粒子爆发（6-9 个粒子）
- **错误消息抖动**：类似碰撞反馈的微妙震荡（±2px，180ms）

### 4. 移动端优化
- 小屏字体增大（< 375px）
- 触摸区域扩大到 46px
- 输入框防 iOS 自动缩放（≥ 1rem）

### 5. 无障碍增强
- 焦点陷阱（focus-trap-react）
- 焦点恢复
- ARIA 完善

## 验收标准

### 视觉效果
- [ ] 标题、正文、标签三级层次清晰可辨
- [ ] 主按钮明显突出，次按钮明显次要
- [ ] 所有间距符合 8px 基准系统
- [ ] 弹窗打开时有微妙的波纹扩散效果

### 交互反馈
- [ ] 按钮 Hover 有 2px 提升 + 光晕增强
- [ ] 按钮点击有按压反馈 + 藏红花色涟漪扩散
- [ ] 加载状态有旋转 Spinner
- [ ] 错误消息滑入 + 微妙抖动
- [ ] 成功图标弹性弹入

### 五子棋主题
- [ ] 按钮涟漪效果使用藏红花色，呼应品牌色
- [ ] 粒子动画参数与落子效果保持一致性
- [ ] 缓动曲线复用项目已有函数（easeOutCubic 等）

### 移动端
- [ ] iPhone SE (375px) 字体清晰可读
- [ ] 按钮触摸区域 ≥ 46px
- [ ] 输入框不触发 iOS 自动缩放

### 无障碍
- [ ] Tab 键无法跳出弹窗（焦点陷阱生效）
- [ ] Esc 关闭后焦点回到触发元素
- [ ] 屏幕阅读器能正确读取错误消息

### 性能
- [ ] 动画帧率保持 60fps
- [ ] prefers-reduced-motion 时粒子效果简化或禁用
- [ ] 弹窗关闭后动画资源正确清理

## 技术约束

### 必须复用的效果
1. 缓动函数：导入 gobang-board.tsx 中的 easeOutCubic/easeInCubic 等
2. 粒子系统参数：参考 ink-effect-canvas.tsx 的配置
3. 波纹扩散逻辑：参考 reset wave crest 的距离衰减算法
4. 颜色系统：复用藏红花色 rgba(229, 173, 61, ...) 作为主题色

### 新增组件
1. ButtonRipple：按钮涟漪效果组件
2. ModalBackdropWave：弹窗背景波纹组件
3. SuccessParticles：成功粒子组件
4. Spinner：加载旋转器组件

## 实施范围

### 涉及文件
- app/modules/gobang/components/common-modal.tsx
- app/modules/gobang/components/online-room-dialog.tsx
- app/app.css（516-806 行）
- 新增：app/modules/gobang/components/button-ripple.tsx
- 新增：app/modules/gobang/components/modal-effects.tsx
- 新增：app/modules/gobang/components/spinner.tsx

### 不包含的范围
- 新增弹窗类型（如游戏结束弹窗）
- 通知栈（Toast）优化
- 声音效果

## 分阶段计划

### Phase 1：核心视觉优化（P0）- 2-3 小时
文字层级、按钮样式、间距系统、Hover/Active 状态

### Phase 2：微动效实现（P1）- 1-2 小时
Spinner、错误/成功动画、输入框优化

### Phase 3：五子棋主题融合（P1+）- 2-3 小时
按钮涟漪、弹窗波纹、成功粒子、错误抖动

### Phase 4：移动端 + 无障碍（P2）- 1-2 小时
响应式、触摸交互、焦点管理、ARIA

## Notes

- 复用现有效果系统，保持品牌一致性
- 五子棋主题效果应微妙克制，避免过于花哨
- 所有动画尊重 prefers-reduced-motion
- 新增依赖仅 focus-trap-react（如无障碍为 P0）
