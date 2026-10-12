// Persistent shell rules are shared by document-start and live styling. Do not
// hand background ownership back to native CSS when region markers are added.
export function createShellStyle(scope='html[data-cc-mac-prepaint] #root') {
  const shell=':is(main.main-surface,main[data-app-shell-main-surface="default"],[data-app-shell-frame],[data-app-shell-page-surface="true"],[data-app-shell-active-page],[data-app-shell-main-content-viewport],.messaging-root,.thread-pane,[class*="FullHeightPageSurfaceLayout"],[class*="MainContentViewport"],[class*="MainContentSurface"],[data-app-shell-tab-strip-controller],[data-app-shell-tabs="true"],[class*="WorkspaceContent"],.thread-scroll-container[data-app-action-timeline-scroll],[data-thread-scroll-footer="true"],aside.app-shell-left-panel,aside[data-app-shell-left-panel-appearance],.sidebar-navigation,nav[data-app-navigation-rail],[data-app-shell-titlebar],[data-app-shell-page-header])';
  return `
    ${scope} > #cc-mac-background {position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;overflow:hidden;border-radius:inherit;contain:strict}
    ${scope} ${shell} {
      background-color:transparent!important;background-image:none!important;
      --color-surface:transparent!important;--color-surface-secondary:transparent!important;--color-surface-tertiary:transparent!important;
    }
    ${scope} :is(div,section,main,nav,header):is(.bg-primary,.bg-secondary,.bg-surface,.bg-surface-secondary,.bg-background-primary,.bg-background-secondary,.bg-background-shell,.bg-background-surface):not(:is([data-composer-layout],[data-composer-surface-variant],.bg-background-composer-action-bar,[data-markdown-copy="code-block"],[class*="CodeBlock_"],[role="button"],[role="switch"],[role="dialog"],[role="menu"],[role="tooltip"])):not(:is([data-composer-layout],[data-composer-surface-variant],[data-markdown-copy="code-block"],[class*="CodeBlock_"],[role="dialog"],[role="menu"],[role="tooltip"]) *) {background-color:transparent!important;background-image:none!important}
    ${scope} :is([class*="WorkspaceContent"],[class*="FullHeightPageSurfaceLayout"],[data-app-shell-workspace-row])::before,
    ${scope} :is([class*="WorkspaceContent"],[class*="FullHeightPageSurfaceLayout"],[data-app-shell-workspace-row])::after {background-color:transparent!important;background-image:none!important}
    ${scope} [class~="group/settings"][data-density] [style*="--color-background-panel"] {background-color:transparent!important;background-image:none!important}
  `;
}
