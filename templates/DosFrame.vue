<template>
  <div class="dos-wrapper">
    <div class="dos-toolbar" aria-hidden="true">
      <div class="font-dd" title="Font size">
        <span class="dd-text">8 x 12</span>
        <span class="dd-arrow">▾</span>
      </div>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Mark">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="#000" stroke-dasharray="2 1"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Copy">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="3.5" width="8" height="9" fill="#fff" stroke="#000"/>
          <rect x="4.5" y="1.5" width="8" height="9" fill="#fff" stroke="#000"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Paste">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="2.5" y="2.5" width="9" height="10" fill="#d9d9c0" stroke="#000"/>
          <rect x="4.5" y="1.5" width="5" height="2" fill="#808080" stroke="#000"/>
        </svg>
      </button>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Full-screen">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="#000080" stroke="#000"/>
          <rect x="3" y="3" width="8" height="8" fill="#c0c0c0"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Properties">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="2.5" width="11" height="9" fill="#fff" stroke="#000"/>
          <line x1="3" y1="5" x2="11" y2="5" stroke="#000"/>
          <line x1="3" y1="7" x2="11" y2="7" stroke="#000"/>
          <line x1="3" y1="9" x2="9" y2="9" stroke="#000"/>
        </svg>
      </button>
      <span class="tb-sep"></span>
      <button class="tb-btn" tabindex="-1" title="Background">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1.5" y="1.5" width="11" height="11" fill="#008080" stroke="#000"/>
        </svg>
      </button>
      <button class="tb-btn" tabindex="-1" title="Font"
              style="font-family:'Times New Roman',serif;font-weight:700;font-size:13px;line-height:1;">A
      </button>
    </div>

    <div class="dos-screen-frame">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: "Perfect DOS VGA 437";
  src: url("https://cdn.jsdelivr.net/gh/Dafnns/perfect-dos-vga-437@master/Perfect%20DOS%20VGA%20437.ttf") format("truetype");
  font-display: swap;
}

.dos-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #c0c0c0;
}

/* Toolbar */
.dos-toolbar {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 4px;
  background: #c0c0c0;
  border-bottom: 1px solid #808080;
  flex-shrink: 0;
}

.dos-toolbar .font-dd {
  display: flex;
  align-items: center;
  background: #fff;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
  padding: 1px 2px 1px 4px;
  font-family: "MS Sans Serif", Tahoma, sans-serif;
  font-size: 11px;
  min-width: 68px;
  height: 20px;
  cursor: default;
}

.dos-toolbar .font-dd .dd-text {
  flex: 1;
  color: #000;
}

.dos-toolbar .font-dd .dd-arrow {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #c0c0c0;
  border-top: 1px solid #fafafa;
  border-left: 1px solid #fafafa;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  margin-left: 3px;
  font-size: 9px;
  color: #000;
}

.dos-toolbar .tb-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  background: #c0c0c0;
  border-top: 1px solid #fafafa;
  border-left: 1px solid #fafafa;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  color: #000;
}

.dos-toolbar .tb-btn:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}

.dos-toolbar .tb-sep {
  width: 1px;
  height: 18px;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  margin: 0 2px;
}

/* Screen frame (sunken) */
.dos-screen-frame {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #000;
  margin: 2px;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #fafafa;
  border-bottom: 1px solid #fafafa;
}
</style>
