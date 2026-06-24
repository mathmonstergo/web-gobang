# Dialog/Modal Components Audit

## Overview
The project uses a single unified modal system with two main components:
- `CommonModal` - Base modal container component
- `OnlineRoomDialog` - Complex multi-step dialog for online room creation/joining
- `OnlineNotificationStack` - Toast-style notifications (not traditional modals)

---

## 1. Modal Components Found

### 1.1 CommonModal (Base Component)
**Location**: `/home/adam/projects/web-gobang/app/modules/gobang/components/common-modal.tsx`

**Purpose**: Reusable modal container for all dialog interactions

**Key Features**:
- Open/close animation with 220ms transition
- ESC key support for closing
- Backdrop click to close
- Accessibility: aria-modal, aria-labelledby
- State management: `shouldRender` + `renderState` for smooth animations

**Technical Details**:
```typescript
type CommonModalProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};
```

---

### 1.2 OnlineRoomDialog
**Location**: `/home/adam/projects/web-gobang/app/modules/gobang/components/online-room-dialog.tsx`

**Purpose**: Multi-step flow for creating/joining online game rooms

**Steps**:
1. `nickname` - Enter player nickname
2. `mode` - Choose "Create Room" or "Join Room"
3. `auto-join` - Auto-joining with pre-filled room code (invisible step)

**Key UI Elements**:
- Nickname input form
- Two-column choice grid (Create vs Join)
- Expandable join panel with invite code validation
- Real-time validation with icon feedback (Search icon, Check icon)
- Error messages for invalid codes

**Special Features**:
- Auto-copies invite link on room creation
- Validates room codes in real-time
- Animated panel expansion (260ms transition)
- Loading states ("创建中")

---

## 2. Modal Usage Patterns

### 2.1 Incoming Request Dialog (Undo/Surrender)
**Location**: `gobang-game.tsx` line 543-572

**Trigger**: When opponent sends undo or surrender request

**Content**:
- Title: "对方请求悔棋" or "对方请求认输"
- Two action buttons: "拒绝" (secondary) + "同意" (primary)

**Usage**:
```tsx
<CommonModal
  isOpen={incomingOnlineRequest !== null}
  onClose={() => handleRespondOnlineRequest(false)}
  title={incomingRequestTitle}
>
  <div className="online-dialog-stack">
    <div className="online-request-actions">
      <button className="online-secondary-action">拒绝</button>
      <button className="online-primary-action">同意</button>
    </div>
  </div>
</CommonModal>
```

---

### 2.2 Exit Notice Dialog
**Location**: `gobang-game.tsx` line 573-594

**Trigger**: User tries to return to offline mode during active online game

**Content**:
- Title: "正在对局"
- Message: "对局进行中，暂时不能返回单机模式。"
- Single action button: "知道了"

**Usage**:
```tsx
<CommonModal
  isOpen={isOnlineExitNoticeOpen}
  onClose={() => setIsOnlineExitNoticeOpen(false)}
  title="正在对局"
>
  <div className="online-dialog-stack">
    <p className="online-modal-message">
      对局进行中，暂时不能返回单机模式。
    </p>
    <button className="online-primary-action">知道了</button>
  </div>
</CommonModal>
```

---

### 2.3 Online Room Setup Dialog
**Location**: `gobang-game.tsx` line 535-542

**Trigger**: User clicks to start online game

**Features**: Full multi-step flow (nickname → mode selection → room creation/joining)

---

## 3. Notification System (Toast-style, NOT Modal)

### OnlineNotificationStack
**Location**: `/home/adam/projects/web-gobang/app/modules/gobang/components/online-notification-stack.tsx`

**Purpose**: Non-blocking toast notifications

**Usage Scenarios**:
- "复制失败" - Copy invite link failed
- Other system notifications

**Characteristics**:
- Fixed positioning at viewport center
- Auto-dismiss animation (2680ms display + 520ms fade out)
- Stacked vertically
- Semi-transparent backdrop blur effect
- Non-modal, doesn't block interaction

---

## 4. Current Style Analysis

### 4.1 Modal Container Styles
**Class**: `.common-modal-panel`

**Visual Design**:
- **Background**: Multi-layer gradient with dark translucent layers
  ```css
  background:
    linear-gradient(180deg, rgba(48, 45, 38, 0.74), rgba(12, 12, 10, 0.86)),
    rgba(20, 19, 17, 0.74);
  ```
- **Border**: 1px solid rgba(255, 250, 235, 0.2)
- **Border Radius**: 22px (very rounded)
- **Shadow**: Complex multi-layer shadow for depth
- **Size**: min(92vw, 382px) width, 228px min-height
- **Padding**: 22px

**Decorative Effects**:
- **Pseudo-element overlay** (::before): Radial + linear gradients for glass effect
- **Animations**:
  - Opacity: 0 → 1
  - Transform: translateY(12px) scale(0.965) → translateY(0) scale(1)
  - Filter: blur(7px) → blur(0)
  - Duration: 220ms cubic-bezier(0.22, 1, 0.36, 1)

---

### 4.2 Backdrop Styles
**Class**: `.common-modal-backdrop`

**Visual Design**:
- **Background**: Radial gradient (saffron tint) + black overlay
  ```css
  background:
    radial-gradient(circle at 50% 42%, rgba(229, 173, 61, 0.1), transparent 34%),
    rgba(0, 0, 0, 0.48);
  ```
- **Backdrop Filter**: blur(14px) saturate(118%)
- **Animation**: Opacity 0 → 1 (220ms)

---

### 4.3 Modal Title
**Class**: `.common-modal-title`

**Typography**:
- Font size: 1.12rem
- Font weight: 900
- Color: #fff2d1 (warm cream)
- Text align: center
- Margin bottom: 18px

---

### 4.4 Button Styles

#### Primary Action Button
**Class**: `.online-primary-action`

**Visual Design**:
- **Height**: 42px min-height
- **Border**: 1px solid rgba(229, 173, 61, 0.32) (saffron accent)
- **Background**: Radial gradient + dark gradients
- **Border Radius**: 10px
- **Color**: #f7ead0 (warm cream)
- **Font**: 0.92rem, weight 900
- **Shadow**: Inset shadows + outer shadow
- **Hover**: Border intensifies, translateY(-1px)
- **Disabled**: opacity 0.44, no hover effect

#### Secondary Action Button
**Class**: `.online-secondary-action`

**Visual Design**:
- Similar structure to primary but with:
  - Border: rgba(255, 250, 235, 0.18) (more neutral)
  - Background: Darker gradients
  - Color: rgba(246, 240, 223, 0.84) (slightly muted)

---

### 4.5 Input Field Styles

#### Text Input
**Class**: `.online-text-input`

**Visual Design**:
- **Height**: 42px min-height
- **Border**: 1px solid rgba(255, 250, 235, 0.18)
- **Border Radius**: 10px
- **Background**: rgba(3, 3, 3, 0.34) (very dark, translucent)
- **Focus State**:
  - Border: rgba(229, 173, 61, 0.68) (saffron accent)
  - Box shadow: 0 0 0 3px rgba(229, 173, 61, 0.13) (glow ring)
  - Background: rgba(10, 10, 9, 0.46)
- **Font**: 0.95rem, weight 800

#### Field Label
**Class**: `.online-field-label`

**Typography**:
- Font size: 0.72rem
- Font weight: 800
- Color: rgba(246, 240, 223, 0.74) (muted cream)

#### Field Error
**Class**: `.online-field-error`

**Typography**:
- Font size: 0.74rem
- Font weight: 800
- Color: #ff7b63 (coral red)
- Text shadow: 0 1px 10px rgba(190, 77, 54, 0.28) (red glow)

---

### 4.6 Layout Components

#### Dialog Stack
**Class**: `.online-dialog-stack`

**Layout**:
- Display: grid
- Gap: 13px
- Vertical stacking of form elements

#### Request Actions (Button Row)
**Class**: `.online-request-actions`

**Layout**:
- Display: grid
- Grid columns: 2 equal columns
- Gap: 9px

#### Choice Grid
**Class**: `.online-choice-grid`

**Layout**:
- Display: grid
- Grid columns: 2 equal columns (1 column on mobile < 430px)
- Gap: 9px

#### Choice Button
**Class**: `.online-choice-button`

**Visual Design**:
- Min height: 78px
- Border radius: 12px
- Similar styling to primary action but taller
- Contains two text elements:
  - Main label: 0.95rem
  - Subtitle: 0.68rem, muted color

---

## 5. Interaction Details

### 5.1 Open/Close Animation
- **Entry**: Fade in + slide up + scale up + blur removal (220ms)
- **Exit**: Fade out (220ms delay before DOM removal)
- **Easing**: cubic-bezier(0.22, 1, 0.36, 1) - smooth ease-out

### 5.2 Keyboard Support
- **ESC key**: Closes modal (implemented in CommonModal useEffect)
- **Form submission**: Enter key submits forms (native behavior)

### 5.3 Focus Management
- Autofocus on nickname input when dialog opens
- Focus-visible outline: 2px solid rgba(229, 173, 61, 0.76) with 3px offset

### 5.4 Expandable Panel Animation
**Class**: `.online-join-panel`

- **Collapsed**: max-height: 0, opacity: 0, translateY(-5px)
- **Expanded**: max-height: 132px (148px on mobile), opacity: 1, translateY(0)
- **Duration**: 260ms cubic-bezier for max-height, 180ms for opacity, 220ms for transform
- **Delay**: 260ms before DOM cleanup when collapsing

---

## 6. Responsive Design

### Desktop (> 860px)
- Modal width: min(92vw, 382px)
- Modal padding: 22px

### Mobile (< 430px)
- Modal width: min(92vw, 360px)
- Modal padding: 20px
- Choice grid: Single column layout
- Join panel expanded height: 148px (vs 132px desktop)

---

## 7. Design Issues & Optimization Opportunities

### 7.1 Visual Hierarchy
**Current Issues**:
- Title color (#fff2d1) and button text color (#f7ead0) are very similar
- Button hierarchy not distinct enough (primary vs secondary)
- Field labels are quite muted, may be hard to read

**Suggestions**:
- Increase contrast between title and body text
- Make primary button more prominent (stronger accent color or different style)
- Consider slightly brighter field labels

### 7.2 Spacing Inconsistencies
**Current Issues**:
- Gap values vary: 7px, 8px, 9px, 13px, 18px (5 different values)
- No clear spacing scale

**Suggestions**:
- Establish a spacing scale (e.g., 4px, 8px, 12px, 16px, 24px)
- Apply consistently across all dialog elements

### 7.3 Button Polish
**Current Issues**:
- Hover effect is subtle (only 1px translateY + slight border change)
- No active/pressed state
- Disabled state only uses opacity, no visual feedback difference

**Suggestions**:
- Add active state: translateY(0) or slightly inset shadow
- Consider ripple effect or subtle scale on click
- Add cursor: not-allowed cursor already present, but could add subtle visual distinction

### 7.4 Micro-animations
**Missing**:
- No button press animation (active state)
- No loading spinner for async operations (e.g., "创建中" has no spinner)
- Error messages appear instantly without animation
- Success states (valid check icon) appear without animation

**Suggestions**:
- Add scale animation on button press
- Add spinner icon for "创建中" state
- Slide-in animation for error messages
- Fade + scale-in for success check icon

### 7.5 Mobile Adaptation
**Current Issues**:
- Font sizes remain the same on mobile (may be small on small screens)
- Touch targets are adequate (42px min-height meets WCAG guidelines)
- Modal may be too wide on very small screens

**Suggestions**:
- Consider slightly larger font sizes on mobile (< 375px)
- Test on iPhone SE / small Android devices

### 7.6 Color Palette Issues
**Observations**:
- Heavy use of dark translucent layers
- Saffron accent (#e5ad3d) is the primary interactive color
- Backgrounds are very dark (rgba(3, 3, 3, 0.34) for inputs)

**Potential Issues**:
- May lack contrast in certain lighting conditions
- Saffron accent may not convey "primary action" strongly enough
- White text on very dark backgrounds can cause eye strain

### 7.7 Animation Performance
**Observations**:
- Multiple animations run simultaneously (opacity, transform, filter)
- Backdrop filter blur(14px) can be expensive on low-end devices
- Prefers-reduced-motion is handled globally

**Suggestions**:
- Test performance on low-end devices
- Consider simplifying animations for backdrop-filter

---

## 8. Accessibility Review

### 8.1 Current Accessibility Features ✓
- `aria-modal="true"` on dialog
- `aria-labelledby` linking to title
- `aria-label` on icon buttons
- `aria-live="polite"` on notification stack
- ESC key support
- Focus-visible styles
- Semantic HTML (button, section[role="dialog"])

### 8.2 Potential Improvements
- Focus trap: Modal doesn't trap focus (Tab can escape to background)
- Focus restoration: No evidence of returning focus to trigger element on close
- ARIA attributes: Could add `aria-describedby` for modal messages
- Error announcements: Error messages lack `role="alert"` for screen readers

---

## 9. Game-Specific Dialogs Not Yet Implemented

### Potential Missing Dialogs
Based on typical Gobang/Gomoku games:

1. **Game Over Dialog** (Currently shows in status pill only)
   - Winner announcement
   - Game statistics
   - Rematch button
   - Return to menu

2. **Settings Dialog**
   - Sound controls
   - Board theme
   - Animation preferences

3. **Help/Rules Dialog**
   - Game rules
   - Controls explanation

4. **Confirmation Dialogs**
   - Reset game confirmation
   - Leave game confirmation (partially exists as exit notice)

**Note**: Game over state currently displays in the status pill (line 492 of gobang-game.tsx):
```tsx
{winnerLabel === null ? `${currentLabel}回合` : `${winnerLabel}胜`}
```
This is subtle and could be enhanced with a proper celebration modal.

---

## 10. Summary of All Dialogs

| Dialog | Component | Trigger | Purpose | Buttons |
|--------|-----------|---------|---------|---------|
| Online Room Setup | OnlineRoomDialog | Click "五子棋·双人联机" | Create/join room | 2 choice buttons + inputs |
| Incoming Request | CommonModal | Opponent sends undo/surrender | Accept/decline request | 拒绝 + 同意 |
| Exit Notice | CommonModal | Try to leave during game | Inform cannot exit | 知道了 |
| Nickname Input | OnlineRoomDialog (step 1) | First time online | Enter player name | 确认 |
| Mode Selection | OnlineRoomDialog (step 2) | After nickname | Choose create/join | 创建房间 + 加入房间 |

**Toast Notifications** (non-modal):
- Copy success/failure
- Connection status
- Game events

---

## File Paths Reference

- **Base Modal**: `/home/adam/projects/web-gobang/app/modules/gobang/components/common-modal.tsx`
- **Online Dialog**: `/home/adam/projects/web-gobang/app/modules/gobang/components/online-room-dialog.tsx`
- **Notification Stack**: `/home/adam/projects/web-gobang/app/modules/gobang/components/online-notification-stack.tsx`
- **Main Game Component**: `/home/adam/projects/web-gobang/app/modules/gobang/components/gobang-game.tsx` (lines 535-594)
- **Styles**: `/home/adam/projects/web-gobang/app/app.css` (lines 516-806 for modals, 807-907 for notifications)

---

## Key CSS Classes Reference

### Modal Structure
- `.common-modal-layer` - Full-screen overlay container
- `.common-modal-backdrop` - Blurred backdrop
- `.common-modal-panel` - Modal box
- `.common-modal-title` - Modal title

### Dialog Content
- `.online-dialog-stack` - Vertical form layout
- `.online-request-actions` - Two-column button row
- `.online-choice-grid` - Two-column choice layout
- `.online-join-panel` - Expandable invite code section
- `.online-modal-message` - Body text message

### Form Elements
- `.online-field` - Input field container
- `.online-field-label` - Input label
- `.online-field-error` - Error message
- `.online-text-input` - Text input
- `.online-input-row` - Input with inline button

### Buttons
- `.online-primary-action` - Primary CTA button
- `.online-secondary-action` - Secondary/cancel button
- `.online-choice-button` - Large two-line choice button
- `.online-icon-button` - Icon-only button (search)

### Special Elements
- `.online-valid-check` - Success check icon
- `.online-notification-item` - Toast notification

---

## Animation Constants

- **Modal open/close**: 220ms
- **Join panel expand**: 260ms (max-height), 220ms (transform)
- **Button hover**: 140ms
- **Input focus**: 140ms
- **Notification display**: 2680ms visible + 520ms fade out

---

## Color Palette (Modal Specific)

- **Title**: #fff2d1 (warm cream)
- **Body text**: rgba(246, 240, 223, 0.78)
- **Muted text**: rgba(246, 240, 223, 0.62-0.74)
- **Primary button**: #f7ead0 text
- **Accent/focus**: rgba(229, 173, 61, ...) (saffron)
- **Error**: #ff7b63 (coral red)
- **Success**: #86e2a4 (mint green)
- **Borders**: rgba(255, 250, 235, 0.18-0.2)
