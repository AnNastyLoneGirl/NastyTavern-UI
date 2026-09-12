const IDS = {
    left: [
        'extensionTopBarToggleSidebar',
        'extensionTopBarToggleConnectionProfiles',
    ],
    center: [
        'extensionTopBarChatName',
        'extensionTopBarSearchInput',
    ],
    right: [
        'extensionTopBarChatManager',
        'extensionTopBarNewChat',
        'extensionTopBarRenameChat',
        'extensionTopBarDeleteChat',
        'extensionTopBarCloseChat',
    ],
};

export class TopInfoBarIntegration {
    constructor() {
        this.topBar = null;
        this.originalOrder = [];
        this.sidebarHeading = null;
    }

    apply() {
        const topBar = document.getElementById('extensionTopBar');
        const profiles = document.getElementById('extensionConnectionProfiles');
        const sidebar = document.getElementById('extensionSideBar');

        if (!topBar && !profiles && !sidebar) {
            document.body?.classList.remove('mt-has-topinfobar');
            return false;
        }

        document.body?.classList.add('mt-has-topinfobar');
        if (topBar) this.enhanceTopBar(topBar);
        if (profiles) this.enhanceProfiles(profiles);
        if (sidebar) this.enhanceSidebar(sidebar);
        return true;
    }

    enhanceTopBar(topBar) {
        if (topBar.dataset.mtIntegrated === 'true') return;

        this.topBar = topBar;
        this.originalOrder = [...topBar.children];
        topBar.dataset.mtIntegrated = 'true';
        topBar.classList.add('mt-topinfobar');
        topBar.setAttribute('role', 'toolbar');
        topBar.setAttribute('aria-label', 'Chat tools');

        const left = document.createElement('div');
        left.className = 'mt-topinfobar-group mt-topinfobar-left';
        left.setAttribute('aria-label', 'Chat navigation');

        const center = document.createElement('div');
        center.className = 'mt-topinfobar-center';

        const right = document.createElement('div');
        right.className = 'mt-topinfobar-group mt-topinfobar-right';
        right.setAttribute('aria-label', 'Chat actions');

        for (const id of IDS.left) {
            const node = document.getElementById(id);
            if (node && node.parentElement === topBar) left.appendChild(node);
        }
        for (const id of IDS.center) {
            const node = document.getElementById(id);
            if (node && node.parentElement === topBar) center.appendChild(node);
        }
        for (const id of IDS.right) {
            const node = document.getElementById(id);
            if (node && node.parentElement === topBar) right.appendChild(node);
        }

        const claimed = new Set([...IDS.left, ...IDS.center, ...IDS.right]);
        for (const child of [...topBar.children]) {
            if (!claimed.has(child.id)) right.appendChild(child);
        }

        topBar.append(left, center, right);

        topBar.querySelectorAll('.right_menu_button').forEach(button => {
            button.classList.add('mt-topinfobar-action');
            if (!button.getAttribute('aria-label') && button.getAttribute('title')) {
                button.setAttribute('aria-label', button.getAttribute('title'));
            }
        });

        const chatName = document.getElementById('extensionTopBarChatName');
        if (chatName) chatName.setAttribute('aria-label', 'Current chat');
        const search = document.getElementById('extensionTopBarSearchInput');
        if (search) search.setAttribute('aria-label', 'Search current chat');
    }

    enhanceProfiles(profiles) {
        profiles.classList.add('mt-topinfobar-profiles');
        profiles.setAttribute('aria-label', 'Connection profile');
        document.getElementById('extensionConnectionProfilesSelect')?.setAttribute('aria-label', 'Connection profile');
    }

    enhanceSidebar(sidebar) {
        sidebar.classList.add('mt-topinfobar-sidebar');
        sidebar.setAttribute('aria-label', 'Chat history');

        if (!sidebar.querySelector(':scope > .mt-topinfobar-sidebar-heading')) {
            const heading = document.createElement('div');
            heading.className = 'mt-topinfobar-sidebar-heading';
            heading.innerHTML = '<div><small>Chat history</small><b>Conversations</b></div>';
            const close = sidebar.querySelector(':scope > .dragClose, .dragClose');
            if (close?.parentElement === sidebar) sidebar.insertBefore(heading, close);
            else sidebar.prepend(heading);
            this.sidebarHeading = heading;
        }

        sidebar.querySelectorAll('.sideBarItem').forEach(item => item.classList.add('mt-topinfobar-chat-card'));
    }

    clean() {
        document.body?.classList.remove('mt-has-topinfobar');

        const topBar = this.topBar || document.getElementById('extensionTopBar');
        if (topBar?.dataset.mtIntegrated === 'true') {
            const groups = [...topBar.querySelectorAll(':scope > .mt-topinfobar-group, :scope > .mt-topinfobar-center')];
            const liveChildren = groups.flatMap(group => [...group.children]);
            const known = new Set(liveChildren);

            for (const node of this.originalOrder) {
                if (node?.isConnected && known.has(node)) topBar.appendChild(node);
            }
            for (const node of liveChildren) {
                if (node?.isConnected && node.parentElement !== topBar) topBar.appendChild(node);
            }
            groups.forEach(group => group.remove());
            topBar.querySelectorAll('.mt-topinfobar-action').forEach(el => el.classList.remove('mt-topinfobar-action'));
            topBar.classList.remove('mt-topinfobar');
            topBar.removeAttribute('data-mt-integrated');
            topBar.removeAttribute('role');
            topBar.removeAttribute('aria-label');
        }

        document.getElementById('extensionConnectionProfiles')?.classList.remove('mt-topinfobar-profiles');
        const sidebar = document.getElementById('extensionSideBar');
        sidebar?.classList.remove('mt-topinfobar-sidebar');
        sidebar?.querySelectorAll('.mt-topinfobar-chat-card').forEach(el => el.classList.remove('mt-topinfobar-chat-card'));
        sidebar?.querySelector(':scope > .mt-topinfobar-sidebar-heading')?.remove();

        this.topBar = null;
        this.originalOrder = [];
        this.sidebarHeading = null;
    }
}
