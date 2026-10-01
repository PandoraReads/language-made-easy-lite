// ============================================================
// Language Made Easy - Upgrade Modal (Paper & Ink Style)
// ============================================================
// Copyright (c) 2024-2026 PandoraReads | panrunrun@gmail.com

import { App, Modal, setIcon } from 'obsidian';
import { t } from '../i18n';
import wechatQrUrl from '../../assets/wechat-qr.jpg';

/**
 * 完整版购买店铺链接(小红书 / B站 / 视频号)。
 */
const STORE_LINKS = {
	xiaohongshu: 'https://xhslink.com/m/4ke3sdw1uXp',
	bilibili: 'https://b23.tv/QYtaP7T',
	weixinChannel: 'https://store.weixin.qq.com/shop/a/T9WX95cCebFqe4F',
} as const;

interface StoreLinkConfig {
	key: keyof typeof STORE_LINKS;
	labelKey: 'upgrade.storeXhs' | 'upgrade.storeBili' | 'upgrade.storeWechat';
	icon: string;
}

const STORE_LIST: StoreLinkConfig[] = [
	{ key: 'xiaohongshu', labelKey: 'upgrade.storeXhs', icon: 'shopping-bag' },
	{ key: 'bilibili', labelKey: 'upgrade.storeBili', icon: 'tv' },
	{ key: 'weixinChannel', labelKey: 'upgrade.storeWechat', icon: 'video' },
];

// PandoraReads — 社区免费版付费引导弹窗。
// 免费版中被移除的高级功能,入口按钮保留可见,点击时弹出本窗口:
// 店铺链接(小红书/B站/视频号) + 微信二维码(咨询用法与高级版)。
export class UpgradeModal extends Modal {
	/** 可选:被点击的功能名,用于在弹窗中高亮说明(如「批量闪卡」)。 */
	private readonly feature: string | null;

	constructor(app: App, feature?: string) {
		super(app);
		this.feature = feature ?? null;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('lme-upgrade-modal');

		// Header
		const header = contentEl.createDiv('lme-upgrade-header');
		const logo = header.createDiv('lme-upgrade-logo');
		setIcon(logo, 'crown');
		header.createEl('h1', { text: t('upgrade.title') });
		header.createEl('p', { text: t('upgrade.subtitle') });

		// Body
		const body = contentEl.createDiv('lme-upgrade-body');
		if (this.feature) {
			body.createDiv('lme-upgrade-feature').setText(t('upgrade.featureLine', { feature: this.feature }));
		}
		body.createEl('p', { text: t('upgrade.desc') });

		// Stores
		body.createDiv('lme-upgrade-stores-title').setText(t('upgrade.storesTitle'));
		const storeRow = body.createDiv('lme-upgrade-store-row');
		for (const store of STORE_LIST) {
			const btn = storeRow.createEl('button', { cls: 'lme-upgrade-store-btn', text: t(store.labelKey) });
			setIcon(btn.createDiv('lme-upgrade-store-icon'), store.icon);
			btn.onclick = () => {
				window.open(STORE_LINKS[store.key], '_blank');
			};
		}
		body.createDiv('lme-upgrade-stores-hint').setText(t('upgrade.storesHint'));

		// WeChat QR + 引导话术
		const wechat = body.createDiv('lme-upgrade-wechat');
		wechat.createEl('img', {
			cls: 'lme-upgrade-qr',
			attr: { src: wechatQrUrl as string, alt: t('upgrade.wechatQrAlt') },
		});
		const wechatText = wechat.createDiv('lme-upgrade-wechat-text');
		wechatText.createDiv('lme-upgrade-wechat-title').setText(t('upgrade.wechatTitle'));
		wechatText.createDiv('lme-upgrade-wechat-desc').setText(t('upgrade.wechatDesc'));

		// Footer
		const footer = contentEl.createDiv('lme-upgrade-footer');
		const closeBtn = footer.createEl('button', { text: t('upgrade.close'), cls: 'mod-cta' });
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
