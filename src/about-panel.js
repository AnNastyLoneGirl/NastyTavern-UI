import { icons } from './icons.js';
import { t } from './i18n.js';
import { escapeHtml as esc } from './utils.js';
import { createModalShell, showModalShell, hideModalShell } from './modal-shell.js';

const LINKS = [
    { id:'youtube', name:'YouTube', handle:'@AnNastyLoneGirl', description:'Tutorials, guides and NastyTavern / SillyTavern content', url:'https://www.youtube.com/@AnNastyLoneGirl' },
    { id:'discord', name:'Discord', handle:'Community server', description:'Get help, share feedback and talk with the community', url:'https://discord.gg/F4ps4dA7tB' },
    { id:'x', name:'X / Twitter', handle:'@AnNastyLoneGirl', description:'News, updates and project announcements', url:'https://x.com/AnNastyLoneGirl' },
    { id:'github', name:'GitHub', handle:'AnNastyLoneGirl', description:'Source code, issues, contributions and releases', url:'https://github.com/AnNastyLoneGirl/NastyTavern-UI' },
    { id:'kofi', name:'Ko-fi', handle:'annastylonegirl', description:'Support development and buy me a coffee', url:'https://ko-fi.com/annastylonegirl' },
];


export class AboutPanel {
    constructor(onDiagnostics) {
        this.onDiagnostics = onDiagnostics;
        this.root = null;
    }

    mount() {
        this.ensure();
    }

    unmount() {
        this.root?.remove();
        this.root = null;
    }

    open() {
        this.ensure();
        showModalShell(this.root);
    }

    close() {
        if (!this.root) return;
        hideModalShell(this.root, { immediate: false });
    }

    ensure() {
        if (this.root = document.querySelector('#nt-about-panel')) return this.root;
        const { root, body } = createModalShell({
            id: 'nt-about-panel',
            title: t('About NastyTavern'),
            subtitle: t('Project, support and contact information'),
            icon: icons.logo,
            modalClass: 'nt-tool-modal nt-about-modal',
            backdropClass: 'nt-tool-backdrop',
            bodyClass: 'nt-about-body',
            closeAttrs: { 'data-nt-about-close': '' },
        });
        body.innerHTML = `
            <section class="nt-about-hero">
              <div class="nt-about-logo">${icons.logo}</div>
              <div class="nt-about-hero-copy">
                <div class="nt-about-title-row"><h2>NastyTavern UI</h2><span>v0.1.4</span></div>
                <p>${t('A modern, ergonomic interface layer for SillyTavern that keeps the native features underneath while making everyday workflows faster and clearer.')}</p>
                <div class="nt-about-meta"><span>${t('Created by Anna / AnNastyLoneGirl')}</span><span>${t('Built for SillyTavern 1.18+')}</span><span>${t('Open source')}</span><span>${t('i18n ready')}</span></div>
              </div>
            </section>

            <section class="nt-about-section">
              <div class="nt-about-section-head"><div><b>${t('Find me online')}</b><small>${t('Tutorials, community, updates, source code and support')}</small></div></div>
              <div class="nt-about-social-grid">
                ${LINKS.map(link => `<a class="nt-about-social nt-about-${link.id}" href="${link.url}" target="_blank" rel="noopener noreferrer">
                  <span class="nt-about-social-mark" data-nt-no-i18n>${this.socialMark(link.id)}</span>
                  <span class="nt-about-social-copy"><b>${esc(link.name)}</b><small data-nt-no-i18n>${esc(link.handle)}</small><em>${t(link.description)}</em></span>
                  <span class="nt-about-social-open" aria-hidden="true">↗</span>
                </a>`).join('')}
              </div>
            </section>

            <section class="nt-about-columns">
              <article class="nt-about-card nt-about-bug-card">
                <div class="nt-about-card-icon">${icons.health}</div>
                <div class="nt-about-card-copy">
                  <h3>${t('Found a bug?')}</h3>
                  <p>${t('If something looks broken, disappears, overlaps or behaves differently from native SillyTavern, please report it. The more context you provide, the faster it can be fixed.')}</p>
                  <ul>
                    <li>${t('Include a screenshot or short recording')}</li>
                    <li>${t('Explain the exact steps to reproduce the issue')}</li>
                    <li>${t('Mention your SillyTavern and NastyTavern versions')}</li>
                    <li>${t('Mention other UI extensions or themes that are enabled')}</li>
                  </ul>
                  <div class="nt-about-actions">
                    <a href="https://github.com/AnNastyLoneGirl/NastyTavern-UI/issues" target="_blank" rel="noopener noreferrer">${icons.external}<span>${t('Open GitHub Issues')}</span></a>
                    <button type="button" data-nt-about-diagnostics>${icons.health}<span>${t('Open diagnostics')}</span></button>
                  </div>
                </div>
              </article>

              <article class="nt-about-card nt-about-community-card">
                <div class="nt-about-card-icon">${icons.chat}</div>
                <div class="nt-about-card-copy">
                  <h3>${t('Need help or want to share feedback?')}</h3>
                  <p>${t('Discord is the easiest place for quick questions, screenshots and discussion. GitHub is better for reproducible bugs, feature requests and technical contributions.')}</p>
                  <div class="nt-about-actions">
                    <a href="https://discord.gg/F4ps4dA7tB" target="_blank" rel="noopener noreferrer">${icons.chat}<span>${t('Join Discord')}</span></a>
                    <a href="https://github.com/AnNastyLoneGirl/NastyTavern-UI" target="_blank" rel="noopener noreferrer">${icons.external}<span>${t('View repository')}</span></a>
                  </div>
                </div>
              </article>
            </section>

            <section class="nt-about-support">
              <div>
                <span class="nt-about-support-icon">☕</span>
                <div><b>${t('Support NastyTavern')}</b><p>${t('If NastyTavern makes SillyTavern more enjoyable for you, you can support future development on Ko-fi. Every contribution helps with testing, compatibility work and new features.')}</p></div>
              </div>
              <a href="https://ko-fi.com/annastylonegirl" target="_blank" rel="noopener noreferrer">${t('Buy me a coffee')} <span aria-hidden="true">↗</span></a>
            </section>

            <section class="nt-about-contribute">
              <div class="nt-about-section-head"><div><b>${t('Want to contribute?')}</b><small>${t('NastyTavern is designed to be easy to extend on GitHub')}</small></div></div>
              <div class="nt-about-contribute-grid">
                <article><b>${t('Translations')}</b><p>${t('Add a locale file so NastyTavern can support more SillyTavern languages.')}</p></article>
                <article><b>${t('Compatibility')}</b><p>${t('Help adapt third-party SillyTavern extensions to the NastyTavern design system.')}</p></article>
                <article><b>${t('Ideas & fixes')}</b><p>${t('Open an issue or pull request for bugs, UX improvements and useful workflow ideas.')}</p></article>
              </div>
            </section>

            <footer class="nt-about-footer"><span>${t('NastyTavern UI is a community extension for SillyTavern.')}</span><span>${t('Thank you for using and improving the project.')} 🤍</span></footer>
        `;
        root.addEventListener('click', event => {
            if (event.target.closest('[data-nt-about-close]')) this.close();
            if (event.target.closest('[data-nt-about-diagnostics]')) {
                this.close();
                setTimeout(() => this.onDiagnostics?.(), 120);
            }
        });
        document.body.append(root);
        this.root = root;
        return root;
    }

    socialMark(id) {
        return { youtube:'▶', discord:'◉', x:'𝕏', github:'⌘', kofi:'☕' }[id] || '↗';
    }
}
