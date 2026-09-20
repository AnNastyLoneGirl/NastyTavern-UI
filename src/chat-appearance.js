import { icons } from './icons.js';
import { t } from './i18n.js';
import { createModalShell, showModalShell, hideModalShell, ensureModalOpacityControl } from './modal-shell.js';
import { saveSettings } from './settings.js';
import { escapeHtml as esc, getContextSafe } from './utils.js';
import { confirmDialog } from './ui-templates.js';

const AVATAR_FORMAT_OPTIONS = Object.freeze([
    { value: 'standard', label: 'Standard' },
    { value: 'veil', label: 'Nasty Veil' },
    { value: 'banner', label: 'Nasty Banner' },
    { value: 'edge', label: 'Nasty Edge' },
]);
const AVATAR_POSITION_OPTIONS = Object.freeze([
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
]);
const AVATAR_TONE_OPTIONS = Object.freeze([
    { value: 'normal', label: 'Normal' },
    { value: 'muted', label: 'Muted' },
    { value: 'dim', label: 'Dim' },
]);
const OBJECT_FIT_OPTIONS = Object.freeze([
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
]);
const FONT_WEIGHT_OPTIONS = Object.freeze([
    { value: 'regular', label: 'Regular' },
    { value: 'medium', label: 'Medium' },
    { value: 'semibold', label: 'Semi bold' },
    { value: 'bold', label: 'Bold' },
]);
const FONT_STYLE_OPTIONS = Object.freeze([
    { value: 'normal', label: 'Normal' },
    { value: 'italic', label: 'Italic' },
]);
const TEXT_TRANSFORM_OPTIONS = Object.freeze([
    { value: 'none', label: 'None' },
    { value: 'uppercase', label: 'Uppercase' },
    { value: 'lowercase', label: 'Lowercase' },
]);
const MESSAGE_ALIGN_OPTIONS = Object.freeze([
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
]);
const BORDER_STYLE_OPTIONS = Object.freeze([
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'none', label: 'None' },
]);
const QUOTE_STYLE_OPTIONS = Object.freeze([
    { value: 'plain', label: 'Plain' },
    { value: 'compact', label: 'Compact' },
    { value: 'accent-edge', label: 'Accent edge' },
]);
const TEXT_DECORATION_OPTIONS = Object.freeze([
    { value: 'underline', label: 'Underline' },
    { value: 'none', label: 'None' },
]);
const FONT_FAMILY_OPTIONS = Object.freeze([
    { value: 'inherit', label: 'Theme font' },
    { value: 'system', label: 'System sans' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
]);
const ALIGNMENT_OPTIONS = Object.freeze([
    { value: 'start', label: 'Start' },
    { value: 'center', label: 'Center' },
    { value: 'end', label: 'End' },
]);
const LIST_STYLE_OPTIONS = Object.freeze([
    { value: 'native', label: 'Native' },
    { value: 'disc', label: 'Disc' },
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
    { value: 'decimal', label: 'Decimal' },
]);
const CODE_WRAP_OPTIONS = Object.freeze([
    { value: 'scroll', label: 'Horizontal scroll' },
    { value: 'wrap', label: 'Wrap long lines' },
]);
const SAME_AS_USER = 'same-user';
const CHAT_APPEARANCE_PRESET_FORMAT = 'NastyTavern-chat-appearance-preset';
const CHAT_APPEARANCE_PRESET_VERSION = 1;
const CHAT_APPEARANCE_PRESET_SEED_VERSION = 1;

const roleDefinition = (role, label) => {
    const prefix = role === 'character' ? 'character' : 'user';
    const title = label;
    const visibleKey = `${prefix}AvatarVisible`;
    const nameVisibleKey = `${prefix}NameVisible`;
    const css = suffix => `--nt-chat-${prefix}-${suffix}`;
    const d = (group, category, suffix, type, labelText, hint, extra = {}) => ({
        role, group, category, key: `${prefix}${suffix}`, type, label: labelText, hint, ...extra,
    });
    return [
        d('Avatar', 'Visibility & layout', 'AvatarVisible', 'boolean', `Show ${title} Avatar`, `Show or hide the avatar on ${role} messages.`, { trueClass: `nt-chat-${prefix}-avatar-show`, falseClass: `nt-chat-${prefix}-avatar-hide` }),
        d('Avatar', 'Visibility & layout', 'AvatarFormat', 'enum', `${title} Avatar style`, 'Choose how the avatar is integrated into the message.', { options: AVATAR_FORMAT_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-format-` }),
        d('Avatar', 'Visibility & layout', 'AvatarPosition', 'enum', `${title} Avatar position`, 'Place the avatar on the left or right side of the message.', { options: AVATAR_POSITION_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-position-` }),
        d('Avatar', 'Size & crop', 'AvatarSize', 'number', 'Avatar size', 'Controls the standard avatar size and scales embedded modes.', { min: 28, max: 160, step: 1, fallback: 50, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-size-custom`, cssVar: css('avatar-size') }),
        d('Avatar', 'Size & crop', 'AvatarMediaWidth', 'number', 'Embedded media width', 'Width used by Veil and Edge presentation modes.', { min: 72, max: 560, step: 1, fallback: 240, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-media-width-custom`, cssVar: css('avatar-media-width') }),
        d('Avatar', 'Size & crop', 'AvatarMediaHeight', 'number', 'Embedded media height', 'Maximum media height for Veil, Banner and Edge.', { min: 72, max: 640, step: 1, fallback: 300, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-media-height-custom`, cssVar: css('avatar-media-height') }),
        d('Avatar', 'Size & crop', 'AvatarFocalX', 'number', 'Horizontal focal point', 'Move the crop focus left or right.', { min: 0, max: 100, step: 1, fallback: 50, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-focal-x-custom`, cssVar: css('avatar-focal-x') }),
        d('Avatar', 'Size & crop', 'AvatarFocalY', 'number', 'Vertical focal point', 'Move the crop focus up or down.', { min: 0, max: 100, step: 1, fallback: 50, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-focal-y-custom`, cssVar: css('avatar-focal-y') }),
        d('Avatar', 'Size & crop', 'AvatarObjectFit', 'enum', 'Image fit', 'Choose whether the avatar fills its frame or stays fully visible.', { options: OBJECT_FIT_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-fit-` }),
        d('Avatar', 'Appearance', 'AvatarBorder', 'boolean', 'Avatar border', 'Add or remove the avatar border.', { onLabel: 'On', offLabel: 'Off', dependsOn: visibleKey, trueClass: `nt-chat-${prefix}-avatar-border-on`, falseClass: `nt-chat-${prefix}-avatar-border-off` }),
        d('Avatar', 'Appearance', 'AvatarBorderColor', 'color', 'Border color', 'Use the theme, accent, or a custom avatar border color.', { dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-border-color-custom`, cssVar: css('avatar-border-color') }),
        d('Avatar', 'Appearance', 'AvatarBorderWidth', 'number', 'Border width', 'Controls the avatar border thickness.', { min: 0, max: 8, step: 1, fallback: 1, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-border-width-custom`, cssVar: css('avatar-border-width') }),
        d('Avatar', 'Appearance', 'AvatarRadius', 'number', 'Corner radius', 'Controls avatar corner rounding.', { min: 0, max: 50, step: 1, fallback: 8, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-radius-custom`, cssVar: css('avatar-radius') }),
        d('Avatar', 'Appearance', 'AvatarOpacity', 'number', 'Avatar opacity', 'Controls how strongly the avatar competes with message text.', { min: 0, max: 100, step: 1, fallback: 100, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-opacity-custom`, cssVar: css('avatar-opacity'), transform: value => String(value / 100) }),
        d('Avatar', 'Appearance', 'AvatarTone', 'enum', 'Avatar tone', 'Reduce saturation or brightness when an image is too visually dominant.', { options: AVATAR_TONE_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-tone-` }),
        d('Avatar', 'Appearance', 'AvatarFadeStrength', 'number', 'Fade strength', 'Controls how gradually embedded avatar media fades into the message.', { min: 0, max: 100, step: 1, fallback: 55, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-fade-custom`, cssVar: css('avatar-fade-start'), transform: value => `${Math.round(94 - (value * 0.58))}%` }),

        d('Avatar', 'Size & crop', 'AvatarMinSize', 'number', 'Minimum size', 'Minimum avatar dimension.', { min: 20, max: 160, step: 1, fallback: 28, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-min-size-custom`, cssVar: css('avatar-min-size') }),
        d('Avatar', 'Size & crop', 'AvatarMaxSize', 'number', 'Maximum size', 'Maximum avatar dimension.', { min: 32, max: 240, step: 1, fallback: 160, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-max-size-custom`, cssVar: css('avatar-max-size') }),
        d('Avatar', 'Visibility & layout', 'AvatarOffsetX', 'number', 'Horizontal offset', 'Move the avatar left or right without changing message layout.', { min: -40, max: 40, step: 1, fallback: 0, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-offset-x-custom`, cssVar: css('avatar-offset-x') }),
        d('Avatar', 'Visibility & layout', 'AvatarOffsetY', 'number', 'Vertical offset', 'Move the avatar up or down relative to the message.', { min: -40, max: 40, step: 1, fallback: 0, unit: 'px', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-offset-y-custom`, cssVar: css('avatar-offset-y') }),
        d('Avatar', 'Visibility & layout', 'AvatarAlign', 'enum', 'Vertical alignment', 'Align the avatar against the message block.', { options: ALIGNMENT_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-align-` }),
        d('Avatar', 'Appearance', 'AvatarBorderStyle', 'enum', 'Border style', 'Controls the avatar border style.', { options: BORDER_STYLE_OPTIONS, dependsOn: visibleKey, classPrefix: `nt-chat-${prefix}-avatar-border-style-` }),
        d('Avatar', 'Appearance', 'AvatarSaturation', 'number', 'Saturation', 'Fine tune avatar color saturation.', { min: 0, max: 200, step: 5, fallback: 100, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-saturation-custom`, cssVar: css('avatar-saturation') }),
        d('Avatar', 'Appearance', 'AvatarGrayscale', 'number', 'Grayscale', 'Desaturate the avatar without changing opacity.', { min: 0, max: 100, step: 5, fallback: 0, unit: '%', dependsOn: visibleKey, className: `nt-chat-${prefix}-avatar-grayscale-custom`, cssVar: css('avatar-grayscale') }),

        d('Name', 'Visibility', 'NameVisible', 'boolean', `Show ${title} Name`, `Show or hide the ${role} name above the message.`, { trueClass: `nt-chat-${prefix}-name-show`, falseClass: `nt-chat-${prefix}-name-hide` }),
        d('Name', 'Typography', 'NameFontSize', 'number', `${title} Name font size`, 'Controls the displayed name size.', { min: 10, max: 40, step: 1, fallback: 16, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-size-custom`, cssVar: css('name-font-size') }),
        d('Name', 'Typography', 'NameWeight', 'enum', `${title} Name weight`, 'Adjust the visual emphasis of the displayed name.', { options: FONT_WEIGHT_OPTIONS, dependsOn: nameVisibleKey, classPrefix: `nt-chat-${prefix}-name-weight-` }),
        d('Name', 'Typography', 'NameStyle', 'enum', 'Font style', 'Use normal or italic name text.', { options: FONT_STYLE_OPTIONS, dependsOn: nameVisibleKey, classPrefix: `nt-chat-${prefix}-name-style-` }),
        d('Name', 'Typography', 'NameTransform', 'enum', 'Text case', 'Keep the original name casing or transform it.', { options: TEXT_TRANSFORM_OPTIONS, dependsOn: nameVisibleKey, classPrefix: `nt-chat-${prefix}-name-transform-` }),
        d('Name', 'Typography', 'NameLetterSpacing', 'number', 'Letter spacing', 'Adjust spacing between name characters.', { min: -2, max: 8, step: 0.1, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-letter-spacing-custom`, cssVar: css('name-letter-spacing') }),
        d('Name', 'Typography', 'NameLineHeight', 'number', 'Line height', 'Controls vertical spacing inside the name line.', { min: 1, max: 2, step: 0.05, fallback: 1.2, unit: '', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-line-height-custom`, cssVar: css('name-line-height') }),
        d('Name', 'Appearance & spacing', 'NameAlign', 'enum', 'Text alignment', 'Align the displayed name within its available row.', { options: MESSAGE_ALIGN_OPTIONS, dependsOn: nameVisibleKey, classPrefix: `nt-chat-${prefix}-name-align-` }),
        d('Name', 'Appearance & spacing', 'NameColor', 'color', `${title} Name color`, 'Use the theme, the NastyTavern accent, or any CSS color including RGBA / alpha.', { dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-color-custom`, cssVar: css('name-color') }),
        d('Name', 'Appearance & spacing', 'NameSpacingBottom', 'number', 'Space below name', 'Controls the gap between the name and message content.', { min: 0, max: 24, step: 1, fallback: 4, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-spacing-custom`, cssVar: css('name-spacing-bottom') }),

        d('Name', 'Typography', 'NameFontFamily', 'enum', 'Font family', 'Choose a theme, system, serif or monospace name font.', { options: FONT_FAMILY_OPTIONS, dependsOn: nameVisibleKey, classPrefix: `nt-chat-${prefix}-name-font-` }),
        d('Name', 'Typography', 'NameWordSpacing', 'number', 'Word spacing', 'Adjust spacing between words in the displayed name.', { min: -4, max: 12, step: 0.5, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-word-spacing-custom`, cssVar: css('name-word-spacing') }),
        d('Name', 'Appearance & spacing', 'NameMarginTop', 'number', 'Space above', 'Controls spacing above the name line.', { min: 0, max: 32, step: 1, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-margin-top-custom`, cssVar: css('name-margin-top') }),
        d('Name', 'Appearance & spacing', 'NameBackground', 'color', 'Background color', 'Optional background behind the displayed name.', { dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-background-custom`, cssVar: css('name-background') }),
        d('Name', 'Appearance & spacing', 'NamePaddingX', 'number', 'Horizontal padding', 'Controls left and right padding around the name.', { min: 0, max: 24, step: 1, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-padding-x-custom`, cssVar: css('name-padding-x') }),
        d('Name', 'Appearance & spacing', 'NamePaddingY', 'number', 'Vertical padding', 'Controls top and bottom padding around the name.', { min: 0, max: 16, step: 1, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-padding-y-custom`, cssVar: css('name-padding-y') }),
        d('Name', 'Appearance & spacing', 'NameRadius', 'number', 'Corner radius', 'Controls rounding of the optional name background.', { min: 0, max: 24, step: 1, fallback: 0, unit: 'px', dependsOn: nameVisibleKey, className: `nt-chat-${prefix}-name-radius-custom`, cssVar: css('name-radius') }),

        d('Message', 'Layout', 'MessageMaxWidth', 'number', 'Message max width', 'Limits the message column on wide screens.', { min: 280, max: 1800, step: 10, fallback: 980, unit: 'px', className: `nt-chat-${prefix}-message-max-width-custom`, cssVar: css('message-max-width') }),
        d('Message', 'Layout', 'MessageAlign', 'enum', 'Message column alignment', 'Align a constrained message column left, center, or right.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-message-align-` }),
        d('Message', 'Layout', 'MessageSpacing', 'number', 'Space after message', 'Controls the visual gap before the next chat message.', { min: 0, max: 48, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-message-spacing-custom`, cssVar: css('message-spacing') }),
        d('Message', 'Internal spacing', 'MessagePaddingX', 'number', 'Horizontal padding', 'Adds horizontal spacing inside the message content area.', { min: 0, max: 64, step: 1, fallback: 12, unit: 'px', className: `nt-chat-${prefix}-message-padding-x-custom`, cssVar: css('message-padding-x') }),
        d('Message', 'Internal spacing', 'MessagePaddingY', 'number', 'Vertical padding', 'Adds vertical spacing inside the message content area.', { min: 0, max: 48, step: 1, fallback: 10, unit: 'px', className: `nt-chat-${prefix}-message-padding-y-custom`, cssVar: css('message-padding-y') }),
        d('Message', 'Internal spacing', 'ParagraphSpacingTop', 'number', 'Paragraph spacing top', 'Adds spacing above paragraphs inside the message.', { min: 0, max: 32, step: 1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-paragraph-top-custom`, cssVar: css('paragraph-spacing-top') }),
        d('Message', 'Internal spacing', 'ParagraphSpacingBottom', 'number', 'Paragraph spacing bottom', 'Adds spacing below paragraphs inside the message.', { min: 0, max: 32, step: 1, fallback: 10, unit: 'px', className: `nt-chat-${prefix}-paragraph-bottom-custom`, cssVar: css('paragraph-spacing-bottom') }),
        d('Message', 'Surface', 'MessageBackgroundColor', 'color', 'Message background', 'Use the theme, an accent tint, or a custom CSS color.', { className: `nt-chat-${prefix}-message-background-custom`, cssVar: css('message-background'), accentValue: 'color-mix(in srgb, var(--mt-accent) 13%, var(--mt-surface-1))' }),
        d('Message', 'Surface', 'MessageBorderColor', 'color', 'Message border color', 'Use the theme, accent, or a custom CSS color.', { className: `nt-chat-${prefix}-message-border-custom`, cssVar: css('message-border-color') }),
        d('Message', 'Surface', 'MessageBorderWidth', 'number', 'Border width', 'Controls message border thickness.', { min: 0, max: 8, step: 1, fallback: 1, unit: 'px', className: `nt-chat-${prefix}-message-border-width-custom`, cssVar: css('message-border-width') }),
        d('Message', 'Surface', 'MessageBorderStyle', 'enum', 'Border style', 'Choose the message border line style.', { options: BORDER_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-message-border-style-` }),
        d('Message', 'Surface', 'MessageRadius', 'number', 'Corner radius', 'Adjusts message corners without changing the global NastyTavern radius.', { min: 0, max: 32, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-message-radius-custom`, cssVar: css('message-radius') }),
        d('Message', 'Base typography', 'MessageTextFontSize', 'number', 'Base text size', 'Controls the inherited message text size before rich-content overrides.', { min: 10, max: 32, step: 1, fallback: 17, unit: 'px', className: `nt-chat-${prefix}-message-size-custom`, cssVar: css('message-font-size') }),
        d('Message', 'Base typography', 'MessageTextAlign', 'enum', 'Text alignment', 'Align message text without moving the message column.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-text-align-` }),
        d('Message', 'Base typography', 'MessageLineHeight', 'number', 'Base line height', 'Controls inherited line spacing before rich-content overrides.', { min: 1, max: 2.4, step: 0.05, fallback: 1.5, unit: '', className: `nt-chat-${prefix}-message-line-height-custom`, cssVar: css('message-line-height') }),

        d('Message', 'Layout', 'MessageMinWidth', 'number', 'Minimum width', 'Minimum message block width.', { min: 0, max: 1200, step: 10, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-message-min-width-custom`, cssVar: css('message-min-width') }),
        d('Message', 'Layout', 'MessageMinHeight', 'number', 'Minimum height', 'Minimum message block height.', { min: 0, max: 600, step: 5, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-message-min-height-custom`, cssVar: css('message-min-height') }),
        d('Message', 'Layout', 'MessageMaxHeight', 'number', 'Maximum height', 'Maximum message block height before its content can overflow.', { min: 80, max: 1600, step: 10, fallback: 1200, unit: 'px', className: `nt-chat-${prefix}-message-max-height-custom`, cssVar: css('message-max-height') }),
        d('Message', 'Surface', 'MessageShadowStrength', 'number', 'Shadow strength', 'Adds a restrained shadow around the message surface.', { min: 0, max: 40, step: 1, fallback: 0, unit: '%', className: `nt-chat-${prefix}-message-shadow-custom`, cssVar: css('message-shadow-strength'), transform: value => String(value / 100) }),

        d('Rich content', 'Normal text', 'TextColor', 'color', 'Text color', 'Controls normal message text without changing dialogue, emphasis, quotes or code.', { className: `nt-chat-${prefix}-text-color-custom`, cssVar: css('text-color') }),
        d('Rich content', 'Normal text', 'NormalFontSize', 'number', 'Font size', 'Controls normal text size only.', { min: 10, max: 32, step: 1, fallback: 17, unit: 'px', className: `nt-chat-${prefix}-normal-size-custom`, cssVar: css('normal-font-size') }),
        d('Rich content', 'Normal text', 'NormalLineHeight', 'number', 'Line height', 'Controls normal text line height only.', { min: 1, max: 2.4, step: 0.05, fallback: 1.5, unit: '', className: `nt-chat-${prefix}-normal-line-height-custom`, cssVar: css('normal-line-height') }),
        d('Rich content', 'Normal text', 'NormalWeight', 'enum', 'Font weight', 'Controls normal text weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-normal-weight-` }),
        d('Rich content', 'Normal text', 'NormalStyle', 'enum', 'Font style', 'Controls normal text style.', { options: FONT_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-normal-style-` }),
        d('Rich content', 'Normal text', 'NormalLetterSpacing', 'number', 'Letter spacing', 'Adjust spacing between normal-text characters.', { min: -2, max: 6, step: 0.1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-normal-letter-spacing-custom`, cssVar: css('normal-letter-spacing') }),

        d('Rich content', 'Normal text', 'NormalFontFamily', 'enum', 'Font family', 'Font family used only by normal paragraphs.', { options: FONT_FAMILY_OPTIONS, classPrefix: `nt-chat-${prefix}-normal-font-` }),
        d('Rich content', 'Normal text', 'NormalWordSpacing', 'number', 'Word spacing', 'Spacing between words in normal paragraphs.', { min: -4, max: 16, step: 0.5, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-normal-word-spacing-custom`, cssVar: css('normal-word-spacing') }),
        d('Rich content', 'Normal text', 'NormalTextAlign', 'enum', 'Text alignment', 'Align normal paragraphs independently from other rich content.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-normal-align-` }),
        d('Rich content', 'Normal text', 'NormalParagraphTop', 'number', 'Space above paragraph', 'Spacing above normal paragraphs only.', { min: 0, max: 32, step: 1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-normal-paragraph-top-custom`, cssVar: css('normal-paragraph-top') }),
        d('Rich content', 'Normal text', 'NormalParagraphBottom', 'number', 'Space below paragraph', 'Spacing below normal paragraphs only.', { min: 0, max: 32, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-normal-paragraph-bottom-custom`, cssVar: css('normal-paragraph-bottom') }),

        d('Rich content', 'Dialogue', 'DialogueFontFamily', 'enum', 'Font family', 'Font family used only by dialogue inside quotation marks.', { options: FONT_FAMILY_OPTIONS, classPrefix: `nt-chat-${prefix}-dialogue-font-` }),
        d('Rich content', 'Dialogue', 'DialogueColor', 'color', 'Dialogue color', 'Controls dialogue rendered between quotation marks without changing blockquotes.', { className: `nt-chat-${prefix}-dialogue-color-custom`, cssVar: css('dialogue-color') }),
        d('Rich content', 'Dialogue', 'DialogueFontSize', 'number', 'Font size', 'Controls dialogue text size.', { min: 10, max: 32, step: 1, fallback: 17, unit: 'px', className: `nt-chat-${prefix}-dialogue-size-custom`, cssVar: css('dialogue-font-size') }),
        d('Rich content', 'Dialogue', 'DialogueLineHeight', 'number', 'Line height', 'Controls dialogue line spacing.', { min: 1, max: 2.4, step: 0.05, fallback: 1.5, unit: '', className: `nt-chat-${prefix}-dialogue-line-height-custom`, cssVar: css('dialogue-line-height') }),
        d('Rich content', 'Dialogue', 'DialogueWeight', 'enum', 'Font weight', 'Controls dialogue weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-dialogue-weight-` }),
        d('Rich content', 'Dialogue', 'DialogueStyle', 'enum', 'Font style', 'Controls dialogue font style.', { options: FONT_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-dialogue-style-` }),
        d('Rich content', 'Dialogue', 'DialogueLetterSpacing', 'number', 'Letter spacing', 'Adjust spacing between dialogue characters.', { min: -2, max: 6, step: 0.1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-dialogue-letter-spacing-custom`, cssVar: css('dialogue-letter-spacing') }),

        d('Rich content', 'Dialogue', 'DialogueWordSpacing', 'number', 'Word spacing', 'Spacing between words in dialogue only.', { min: -4, max: 16, step: 0.5, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-dialogue-word-spacing-custom`, cssVar: css('dialogue-word-spacing') }),
        d('Rich content', 'Dialogue', 'DialogueTextAlign', 'enum', 'Text alignment', 'Align dialogue independently.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-dialogue-align-` }),

        d('Rich content', 'Emphasis / narration', 'EmphasisFontFamily', 'enum', 'Font family', 'Font family used only by emphasis and narration.', { options: FONT_FAMILY_OPTIONS, classPrefix: `nt-chat-${prefix}-emphasis-font-` }),
        d('Rich content', 'Emphasis / narration', 'EmphasisColor', 'color', 'Text color', 'Controls semantic emphasized / narration text.', { className: `nt-chat-${prefix}-emphasis-color-custom`, cssVar: css('emphasis-color') }),
        d('Rich content', 'Emphasis / narration', 'EmphasisFontSize', 'number', 'Font size', 'Controls emphasis / narration text size.', { min: 10, max: 32, step: 1, fallback: 17, unit: 'px', className: `nt-chat-${prefix}-emphasis-size-custom`, cssVar: css('emphasis-font-size') }),
        d('Rich content', 'Emphasis / narration', 'EmphasisLineHeight', 'number', 'Line height', 'Controls emphasis / narration line spacing.', { min: 1, max: 2.4, step: 0.05, fallback: 1.5, unit: '', className: `nt-chat-${prefix}-emphasis-line-height-custom`, cssVar: css('emphasis-line-height') }),
        d('Rich content', 'Emphasis / narration', 'EmphasisWeight', 'enum', 'Font weight', 'Controls emphasis / narration weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-emphasis-weight-` }),
        d('Rich content', 'Emphasis / narration', 'EmphasisStyle', 'enum', 'Font style', 'Controls whether emphasis remains italic or is forced normal.', { options: FONT_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-emphasis-style-` }),
        d('Rich content', 'Emphasis / narration', 'EmphasisLetterSpacing', 'number', 'Letter spacing', 'Adjust spacing between emphasis / narration characters.', { min: -2, max: 6, step: 0.1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-emphasis-letter-spacing-custom`, cssVar: css('emphasis-letter-spacing') }),

        d('Rich content', 'Emphasis / narration', 'EmphasisWordSpacing', 'number', 'Word spacing', 'Spacing between words in emphasis and narration.', { min: -4, max: 16, step: 0.5, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-emphasis-word-spacing-custom`, cssVar: css('emphasis-word-spacing') }),
        d('Rich content', 'Emphasis / narration', 'EmphasisTextAlign', 'enum', 'Text alignment', 'Align emphasis and narration independently.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-emphasis-align-` }),

        d('Rich content', 'Quoted line', 'QuoteFontFamily', 'enum', 'Font family', 'Font family used only by blockquotes.', { options: FONT_FAMILY_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-font-` }),
        d('Rich content', 'Quoted line', 'QuoteStyle', 'enum', 'Quote style', 'Choose the blockquote structure.', { options: QUOTE_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-style-` }),
        d('Rich content', 'Quoted line', 'QuoteColor', 'color', 'Text color', 'Controls blockquote text color only.', { className: `nt-chat-${prefix}-quote-color-custom`, cssVar: css('quote-color') }),
        d('Rich content', 'Quoted line', 'QuoteFontSize', 'number', 'Font size', 'Controls blockquote text size.', { min: 10, max: 32, step: 1, fallback: 17, unit: 'px', className: `nt-chat-${prefix}-quote-size-custom`, cssVar: css('quote-font-size') }),
        d('Rich content', 'Quoted line', 'QuoteLineHeight', 'number', 'Line height', 'Controls blockquote line spacing.', { min: 1, max: 2.4, step: 0.05, fallback: 1.5, unit: '', className: `nt-chat-${prefix}-quote-line-height-custom`, cssVar: css('quote-line-height') }),
        d('Rich content', 'Quoted line', 'QuoteBackground', 'color', 'Background', 'Controls the blockquote background.', { className: `nt-chat-${prefix}-quote-background-custom`, cssVar: css('quote-background') }),
        d('Rich content', 'Quoted line', 'QuoteBorderColor', 'color', 'Border color', 'Controls the blockquote edge/border color.', { className: `nt-chat-${prefix}-quote-border-color-custom`, cssVar: css('quote-border-color') }),
        d('Rich content', 'Quoted line', 'QuoteBorderWidth', 'number', 'Border width', 'Controls the blockquote edge thickness.', { min: 0, max: 8, step: 1, fallback: 2, unit: 'px', className: `nt-chat-${prefix}-quote-border-width-custom`, cssVar: css('quote-border-width') }),
        d('Rich content', 'Quoted line', 'QuoteWeight', 'enum', 'Font weight', 'Controls blockquote text weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-weight-` }),
        d('Rich content', 'Quoted line', 'QuoteStyleText', 'enum', 'Font style', 'Controls blockquote font style.', { options: FONT_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-text-style-` }),
        d('Rich content', 'Quoted line', 'QuotePaddingX', 'number', 'Horizontal padding', 'Controls horizontal padding inside blockquotes.', { min: 0, max: 32, step: 1, fallback: 10, unit: 'px', className: `nt-chat-${prefix}-quote-padding-x-custom`, cssVar: css('quote-padding-x') }),
        d('Rich content', 'Quoted line', 'QuotePaddingY', 'number', 'Vertical padding', 'Controls vertical padding inside blockquotes.', { min: 0, max: 24, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-quote-padding-y-custom`, cssVar: css('quote-padding-y') }),
        d('Rich content', 'Quoted line', 'QuoteMarginY', 'number', 'Vertical margin', 'Controls spacing above and below blockquotes.', { min: 0, max: 32, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-quote-margin-y-custom`, cssVar: css('quote-margin-y') }),

        d('Rich content', 'Quoted line', 'QuoteLetterSpacing', 'number', 'Letter spacing', 'Adjust character spacing inside blockquotes.', { min: -2, max: 8, step: 0.1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-quote-letter-spacing-custom`, cssVar: css('quote-letter-spacing') }),
        d('Rich content', 'Quoted line', 'QuoteWordSpacing', 'number', 'Word spacing', 'Adjust word spacing inside blockquotes.', { min: -4, max: 16, step: 0.5, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-quote-word-spacing-custom`, cssVar: css('quote-word-spacing') }),
        d('Rich content', 'Quoted line', 'QuoteTextAlign', 'enum', 'Text alignment', 'Align quoted text independently.', { options: MESSAGE_ALIGN_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-align-` }),
        d('Rich content', 'Quoted line', 'QuoteBorderStyle', 'enum', 'Border style', 'Controls the quote edge style.', { options: BORDER_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-quote-border-style-` }),
        d('Rich content', 'Quoted line', 'QuoteRadius', 'number', 'Corner radius', 'Controls blockquote corner rounding.', { min: 0, max: 24, step: 1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-quote-radius-custom`, cssVar: css('quote-radius') }),
        d('Rich content', 'Quoted line', 'QuoteMaxWidth', 'number', 'Maximum width', 'Limits blockquote width inside a message.', { min: 20, max: 100, step: 1, fallback: 100, unit: '%', className: `nt-chat-${prefix}-quote-max-width-custom`, cssVar: css('quote-max-width') }),
        d('Rich content', 'Quoted line', 'QuoteIndent', 'number', 'Indent', 'Offsets the blockquote from the message edge.', { min: 0, max: 64, step: 1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-quote-indent-custom`, cssVar: css('quote-indent') }),

        d('Rich content', 'Code', 'CodeFontFamily', 'enum', 'Font family', 'Choose the font used by inline and block code.', { options: FONT_FAMILY_OPTIONS, classPrefix: `nt-chat-${prefix}-code-font-` }),
        d('Rich content', 'Code', 'CodeFontSize', 'number', 'Font size', 'Controls inline code and code block text size.', { min: 9, max: 28, step: 1, fallback: 14, unit: 'px', className: `nt-chat-${prefix}-code-size-custom`, cssVar: css('code-font-size') }),
        d('Rich content', 'Code', 'CodeLineHeight', 'number', 'Line height', 'Controls code line spacing.', { min: 1, max: 2.2, step: 0.05, fallback: 1.45, unit: '', className: `nt-chat-${prefix}-code-line-height-custom`, cssVar: css('code-line-height') }),
        d('Rich content', 'Code', 'CodeColor', 'color', 'Text color', 'Controls code text color.', { className: `nt-chat-${prefix}-code-color-custom`, cssVar: css('code-color') }),
        d('Rich content', 'Code', 'CodeBackground', 'color', 'Background', 'Controls code background color.', { className: `nt-chat-${prefix}-code-background-custom`, cssVar: css('code-background') }),
        d('Rich content', 'Code', 'CodeBorderColor', 'color', 'Border color', 'Controls the code border color.', { className: `nt-chat-${prefix}-code-border-color-custom`, cssVar: css('code-border-color') }),
        d('Rich content', 'Code', 'CodeBorderWidth', 'number', 'Border width', 'Controls code border thickness.', { min: 0, max: 6, step: 1, fallback: 1, unit: 'px', className: `nt-chat-${prefix}-code-border-width-custom`, cssVar: css('code-border-width') }),
        d('Rich content', 'Code', 'CodeRadius', 'number', 'Corner radius', 'Controls code block corner rounding.', { min: 0, max: 20, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-code-radius-custom`, cssVar: css('code-radius') }),
        d('Rich content', 'Code', 'CodePadding', 'number', 'Padding', 'Controls padding around code blocks and inline code.', { min: 0, max: 24, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-code-padding-custom`, cssVar: css('code-padding') }),

        d('Rich content', 'Code', 'CodeWeight', 'enum', 'Font weight', 'Controls code text weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-code-weight-` }),
        d('Rich content', 'Code', 'CodeBorderStyle', 'enum', 'Border style', 'Controls code border style.', { options: BORDER_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-code-border-style-` }),
        d('Rich content', 'Code', 'CodeWrap', 'enum', 'Long line behavior', 'Wrap long lines or keep horizontal scrolling.', { options: CODE_WRAP_OPTIONS, classPrefix: `nt-chat-${prefix}-code-wrap-` }),
        d('Rich content', 'Code', 'InlineCodePaddingX', 'number', 'Inline horizontal padding', 'Horizontal padding for inline code only.', { min: 0, max: 12, step: 1, fallback: 3, unit: 'px', className: `nt-chat-${prefix}-inline-code-padding-x-custom`, cssVar: css('inline-code-padding-x') }),
        d('Rich content', 'Code', 'InlineCodePaddingY', 'number', 'Inline vertical padding', 'Vertical padding for inline code only.', { min: 0, max: 8, step: 1, fallback: 1, unit: 'px', className: `nt-chat-${prefix}-inline-code-padding-y-custom`, cssVar: css('inline-code-padding-y') }),
        d('Rich content', 'Code', 'BlockCodePaddingX', 'number', 'Block horizontal padding', 'Horizontal padding for code blocks only.', { min: 0, max: 32, step: 1, fallback: 10, unit: 'px', className: `nt-chat-${prefix}-block-code-padding-x-custom`, cssVar: css('block-code-padding-x') }),
        d('Rich content', 'Code', 'BlockCodePaddingY', 'number', 'Block vertical padding', 'Vertical padding for code blocks only.', { min: 0, max: 32, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-block-code-padding-y-custom`, cssVar: css('block-code-padding-y') }),

        d('Rich content', 'Links', 'LinkColor', 'color', 'Link color', 'Controls links inside message content.', { className: `nt-chat-${prefix}-link-color-custom`, cssVar: css('link-color') }),
        d('Rich content', 'Links', 'LinkWeight', 'enum', 'Font weight', 'Controls link emphasis.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-link-weight-` }),
        d('Rich content', 'Links', 'LinkDecoration', 'enum', 'Underline', 'Show or remove the link underline.', { options: TEXT_DECORATION_OPTIONS, classPrefix: `nt-chat-${prefix}-link-decoration-` }),

        d('Rich content', 'Links', 'LinkHoverColor', 'color', 'Hover color', 'Controls link color on hover.', { className: `nt-chat-${prefix}-link-hover-color-custom`, cssVar: css('link-hover-color') }),
        d('Rich content', 'Links', 'LinkVisitedColor', 'color', 'Visited color', 'Controls visited link color when browser history allows it.', { className: `nt-chat-${prefix}-link-visited-color-custom`, cssVar: css('link-visited-color') }),
        d('Rich content', 'Links', 'LinkUnderlineThickness', 'number', 'Underline thickness', 'Controls link underline thickness.', { min: 1, max: 5, step: 1, fallback: 1, unit: 'px', className: `nt-chat-${prefix}-link-underline-thickness-custom`, cssVar: css('link-underline-thickness') }),

        d('Rich content', 'Headings', 'HeadingColor', 'color', 'Heading color', 'Controls Markdown heading text color.', { className: `nt-chat-${prefix}-heading-color-custom`, cssVar: css('heading-color') }),
        d('Rich content', 'Headings', 'HeadingWeight', 'enum', 'Font weight', 'Controls heading weight.', { options: FONT_WEIGHT_OPTIONS, classPrefix: `nt-chat-${prefix}-heading-weight-` }),
        d('Rich content', 'Headings', 'HeadingScale', 'number', 'Size scale', 'Scales headings relative to their native SillyTavern size.', { min: 70, max: 160, step: 5, fallback: 100, unit: '%', className: `nt-chat-${prefix}-heading-scale-custom`, cssVar: css('heading-scale'), transform: value => `${value}%` }),
        d('Rich content', 'Headings', 'HeadingSpacingTop', 'number', 'Space above', 'Controls spacing above headings.', { min: 0, max: 40, step: 1, fallback: 12, unit: 'px', className: `nt-chat-${prefix}-heading-top-custom`, cssVar: css('heading-spacing-top') }),
        d('Rich content', 'Headings', 'HeadingSpacingBottom', 'number', 'Space below', 'Controls spacing below headings.', { min: 0, max: 32, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-heading-bottom-custom`, cssVar: css('heading-spacing-bottom') }),

        d('Rich content', 'Headings', 'HeadingLineHeight', 'number', 'Line height', 'Controls heading line height.', { min: 1, max: 2, step: 0.05, fallback: 1.2, unit: '', className: `nt-chat-${prefix}-heading-line-height-custom`, cssVar: css('heading-line-height') }),
        d('Rich content', 'Headings', 'H1Scale', 'number', 'H1 scale', 'Scale H1 headings independently.', { min: 70, max: 180, step: 5, fallback: 100, unit: '%', className: `nt-chat-${prefix}-h1-scale-custom`, cssVar: css('h1-scale'), transform: value => `${value}%` }),
        d('Rich content', 'Headings', 'H2Scale', 'number', 'H2 scale', 'Scale H2 headings independently.', { min: 70, max: 180, step: 5, fallback: 100, unit: '%', className: `nt-chat-${prefix}-h2-scale-custom`, cssVar: css('h2-scale'), transform: value => `${value}%` }),
        d('Rich content', 'Headings', 'H3Scale', 'number', 'H3 scale', 'Scale H3 headings independently.', { min: 70, max: 180, step: 5, fallback: 100, unit: '%', className: `nt-chat-${prefix}-h3-scale-custom`, cssVar: css('h3-scale'), transform: value => `${value}%` }),

        d('Rich content', 'Lists', 'ListMarkerColor', 'color', 'Marker color', 'Controls bullets and numbered-list markers.', { className: `nt-chat-${prefix}-list-marker-color-custom`, cssVar: css('list-marker-color') }),
        d('Rich content', 'Lists', 'ListIndent', 'number', 'Indent', 'Controls list indentation.', { min: 0, max: 64, step: 1, fallback: 24, unit: 'px', className: `nt-chat-${prefix}-list-indent-custom`, cssVar: css('list-indent') }),
        d('Rich content', 'Lists', 'ListItemSpacing', 'number', 'Item spacing', 'Controls vertical spacing between list items.', { min: 0, max: 24, step: 1, fallback: 4, unit: 'px', className: `nt-chat-${prefix}-list-item-spacing-custom`, cssVar: css('list-item-spacing') }),

        d('Rich content', 'Lists', 'ListStyle', 'enum', 'Marker style', 'Choose a list marker style.', { options: LIST_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-list-style-` }),
        d('Rich content', 'Lists', 'ListSpacingTop', 'number', 'Space above list', 'Spacing above lists.', { min: 0, max: 32, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-list-top-custom`, cssVar: css('list-spacing-top') }),
        d('Rich content', 'Lists', 'ListSpacingBottom', 'number', 'Space below list', 'Spacing below lists.', { min: 0, max: 32, step: 1, fallback: 6, unit: 'px', className: `nt-chat-${prefix}-list-bottom-custom`, cssVar: css('list-spacing-bottom') }),

        d('Rich content', 'Media', 'MediaMaxWidth', 'number', 'Maximum width', 'Limits images, video and iframes embedded inside messages.', { min: 10, max: 100, step: 1, fallback: 100, unit: '%', className: `nt-chat-${prefix}-media-width-custom`, cssVar: css('media-max-width') }),
        d('Rich content', 'Media', 'MediaMaxHeight', 'number', 'Maximum height', 'Limits embedded media height.', { min: 80, max: 1200, step: 10, fallback: 640, unit: 'px', className: `nt-chat-${prefix}-media-height-custom`, cssVar: css('media-max-height') }),
        d('Rich content', 'Media', 'MediaBorderColor', 'color', 'Border color', 'Controls embedded media border color.', { className: `nt-chat-${prefix}-media-border-color-custom`, cssVar: css('media-border-color') }),
        d('Rich content', 'Media', 'MediaBorderWidth', 'number', 'Border width', 'Controls embedded media border thickness.', { min: 0, max: 8, step: 1, fallback: 0, unit: 'px', className: `nt-chat-${prefix}-media-border-width-custom`, cssVar: css('media-border-width') }),
        d('Rich content', 'Media', 'MediaRadius', 'number', 'Corner radius', 'Controls embedded media corner rounding.', { min: 0, max: 32, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-media-radius-custom`, cssVar: css('media-radius') }),
        d('Rich content', 'Media', 'MediaAlign', 'enum', 'Alignment', 'Align embedded media in the message.', { options: ALIGNMENT_OPTIONS, classPrefix: `nt-chat-${prefix}-media-align-` }),
        d('Rich content', 'Media', 'MediaObjectFit', 'enum', 'Object fit', 'Choose whether media fills or fits its box.', { options: OBJECT_FIT_OPTIONS, classPrefix: `nt-chat-${prefix}-media-fit-` }),
        d('Rich content', 'Media', 'MediaMarginTop', 'number', 'Space above', 'Spacing above embedded media.', { min: 0, max: 40, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-media-margin-top-custom`, cssVar: css('media-margin-top') }),
        d('Rich content', 'Media', 'MediaMarginBottom', 'number', 'Space below', 'Spacing below embedded media.', { min: 0, max: 40, step: 1, fallback: 8, unit: 'px', className: `nt-chat-${prefix}-media-margin-bottom-custom`, cssVar: css('media-margin-bottom') }),
        d('Rich content', 'Media', 'MediaBorderStyle', 'enum', 'Border style', 'Controls embedded media border style.', { options: BORDER_STYLE_OPTIONS, classPrefix: `nt-chat-${prefix}-media-border-style-` }),
        d('Rich content', 'Media', 'MediaOpacity', 'number', 'Opacity', 'Controls embedded media opacity.', { min: 0, max: 100, step: 1, fallback: 100, unit: '%', className: `nt-chat-${prefix}-media-opacity-custom`, cssVar: css('media-opacity'), transform: value => String(value / 100) }),
    ];
};

export const CHAT_APPEARANCE_DEFINITIONS = Object.freeze([
    ...roleDefinition('character', 'Character'),
    ...roleDefinition('user', 'User'),
]);
export const CHAT_APPEARANCE_DEFAULTS = Object.freeze(Object.fromEntries(CHAT_APPEARANCE_DEFINITIONS.map(definition => [definition.key, null])));

function factoryPresetValues(kind) {
    const values = structuredClone(CHAT_APPEARANCE_DEFAULTS);
    const both = (suffix, value) => {
        values[`character${suffix}`] = value;
        values[`user${suffix}`] = value;
    };
    if (kind === 'compact') {
        both('AvatarSize', 40);
        both('NameFontSize', 14);
        both('MessageTextFontSize', 15);
        both('MessageLineHeight', 1.4);
        both('MessagePaddingX', 9);
        both('MessagePaddingY', 7);
        both('MessageSpacing', 5);
        both('ParagraphSpacingBottom', 6);
        both('CodeFontSize', 12);
    } else if (kind === 'reading') {
        both('AvatarSize', 48);
        both('MessageTextFontSize', 18);
        both('MessageLineHeight', 1.65);
        both('MessageMaxWidth', 920);
        both('MessageAlign', 'center');
        both('MessagePaddingX', 16);
        both('MessagePaddingY', 12);
        both('ParagraphSpacingBottom', 12);
        both('CodeFontSize', 14);
        both('MediaMaxWidth', 92);
    } else if (kind === 'cinematic') {
        values.characterAvatarFormat = 'veil';
        values.userAvatarFormat = 'veil';
        values.characterAvatarPosition = 'left';
        values.userAvatarPosition = 'right';
        both('AvatarOpacity', 88);
        both('AvatarMediaWidth', 240);
        both('AvatarMediaHeight', 300);
        both('AvatarFadeStrength', 62);
        both('MessageTextFontSize', 17);
        both('MessageLineHeight', 1.55);
        both('MessagePaddingX', 16);
        both('MessagePaddingY', 12);
        both('MessageSpacing', 10);
    }
    return cleanAppearanceObject(values);
}

const FACTORY_PRESETS = Object.freeze([
    { id: 'nt-compact', name: 'Compact', kind: 'compact' },
    { id: 'nt-reading', name: 'Reading', kind: 'reading' },
    { id: 'nt-cinematic', name: 'Cinematic', kind: 'cinematic' },
]);

const definitionMap = new Map(CHAT_APPEARANCE_DEFINITIONS.map(definition => [definition.key, definition]));
const roles = Object.freeze([
    { id: 'user', label: 'User' },
    { id: 'character', label: 'Character' },
]);
const groups = Object.freeze(['Avatar', 'Name', 'Message', 'Rich content']);
const categoriesFor = (role, group) => [...new Set(CHAT_APPEARANCE_DEFINITIONS.filter(definition => definition.role === role && definition.group === group).map(definition => definition.category))];
const categoryCount = (values, role, group, category) => CHAT_APPEARANCE_DEFINITIONS.filter(definition => definition.role === role && definition.group === group && definition.category === category).reduce((count, definition) => count + (normalizedValue(definition, values?.[definition.key]) !== null ? 1 : 0), 0);

function controlSection(definition) {
    const key = definition.key.replace(/^(user|character)/, '');
    if (/Border/.test(key)) return 'Border';
    if (/Width|Height|Size|Scale|Radius|Min|Max|Focal/.test(key)) return 'Size & geometry';
    if (/Font|Weight|StyleText|LineHeight|LetterSpacing|WordSpacing|TextAlign/.test(key)) return 'Typography';
    if (/Padding|Margin|Spacing|Indent|Offset/.test(key)) return 'Spacing & position';
    if (/Color|Background|Opacity|Tone|Saturation|Grayscale|Shadow|Fade/.test(key)) return 'Color & appearance';
    if (/Visible|Format|Position|Align|Transform|Wrap|ObjectFit|Style$/.test(key)) return 'Layout & behavior';
    return 'Options';
}

function categoryDefinitions(role, group, category) {
    return CHAT_APPEARANCE_DEFINITIONS.filter(definition => definition.role === role && definition.group === group && definition.category === category);
}

function controlRank(definition) {
    const key = definition.key.replace(/^(user|character)/, '');
    const ranks = [
        [/Visible$/, 0], [/Format$/, 5], [/Position$/, 10], [/Align$/, 15],
        [/MinWidth$/, 20], [/MaxWidth$/, 21], [/MinHeight$/, 22], [/MaxHeight$/, 23],
        [/(^|Media)Width$/, 30], [/(^|Media)Height$/, 31], [/Size$/, 32], [/Scale$/, 33],
        [/FocalX$/, 40], [/FocalY$/, 41], [/ObjectFit$/, 42],
        [/FontFamily$/, 50], [/FontSize$/, 51], [/Weight$/, 52], [/(StyleText|Style)$/, 53], [/LineHeight$/, 54], [/LetterSpacing$/, 55], [/WordSpacing$/, 56], [/TextAlign$/, 57],
        [/Background/, 60], [/Color$/, 61], [/Opacity$/, 62], [/Tone$/, 63], [/Saturation$/, 64], [/Grayscale$/, 65], [/Shadow/, 66], [/Fade/, 67],
        [/BorderWidth$/, 70], [/BorderStyle$/, 71], [/BorderColor$/, 72], [/Radius$/, 73],
        [/PaddingX$/, 80], [/PaddingY$/, 81], [/MarginTop$/, 82], [/MarginBottom$/, 83], [/SpacingTop$/, 84], [/SpacingBottom$/, 85], [/Spacing$/, 86], [/Indent$/, 87], [/OffsetX$/, 88], [/OffsetY$/, 89],
    ];
    for (const [pattern, rank] of ranks) if (pattern.test(key)) return rank;
    return 100;
}

const ownedBodyClasses = [...new Set(CHAT_APPEARANCE_DEFINITIONS.flatMap(definition => {
    if (definition.type === 'boolean' && definition.trueClass && definition.falseClass) return [definition.trueClass, definition.falseClass];
    if (definition.type === 'enum' && definition.classPrefix) return (definition.options || []).map(option => `${definition.classPrefix}${option.value}`);
    if (definition.className) return [definition.className];
    return [];
}))];
const ownedCssVariables = [...new Set(CHAT_APPEARANCE_DEFINITIONS.map(definition => definition.cssVar).filter(Boolean))];

function numberValue(definition, value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(definition.max, Math.max(definition.min, parsed));
}

function cssColorValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const candidate = String(value).trim();
    try {
        return CSS.supports('color', candidate) ? candidate : null;
    } catch (_) {
        return /^#[0-9a-f]{3,8}$/i.test(candidate) ? candidate : null;
    }
}

function normalizedValue(definition, value) {
    if (value === null || value === undefined) return null;
    if (definition.role === 'character' && String(value) === SAME_AS_USER) return SAME_AS_USER;
    if (definition.type === 'boolean') return value === true ? true : value === false ? false : null;
    if (definition.type === 'enum') {
        const candidate = String(value);
        return definition.options?.some(option => option.value === candidate) ? candidate : null;
    }
    if (definition.type === 'color') {
        const candidate = String(value).trim();
        if (candidate === 'accent') return 'accent';
        return cssColorValue(candidate);
    }
    return numberValue(definition, value);
}

function matchingUserDefinition(definition) {
    if (!definition || definition.role !== 'character') return null;
    return definitionMap.get(definition.key.replace(/^character/, 'user')) || null;
}

function cleanAppearanceObject(value) {
    const source = value && typeof value === 'object' ? value : {};
    const migrated = { ...source };
    if (source.avatarVisible === true || source.avatarVisible === false) {
        if (migrated.characterAvatarVisible == null) migrated.characterAvatarVisible = source.avatarVisible;
        if (migrated.userAvatarVisible == null) migrated.userAvatarVisible = source.avatarVisible;
    }
    const legacyAvatarFormats = new Set(['soft', 'sigil', 'cut']);
    if (legacyAvatarFormats.has(String(migrated.characterAvatarFormat || ''))) migrated.characterAvatarFormat = 'standard';
    if (legacyAvatarFormats.has(String(migrated.userAvatarFormat || ''))) migrated.userAvatarFormat = 'standard';

    const migratePair = (legacyKey, characterKey, userKey) => {
        if (migrated[legacyKey] == null) return;
        if (migrated[characterKey] == null) migrated[characterKey] = migrated[legacyKey];
        if (migrated[userKey] == null) migrated[userKey] = migrated[legacyKey];
    };

    // Opacity is now encoded directly in color values (rgba(), #RRGGBBAA,
    // color-mix(), etc.) instead of being stored as a separate visual setting.
    // Preserve existing custom color + opacity combinations when migrating.
    const mergeLegacyOpacityIntoColor = (colorKey, opacityKey, fallbackToCurrentColor = false) => {
        const rawOpacity = migrated[opacityKey];
        if (rawOpacity == null || rawOpacity === SAME_AS_USER) return;
        const opacity = Math.min(100, Math.max(0, Number(rawOpacity)));
        if (!Number.isFinite(opacity) || opacity >= 100) return;
        let color = migrated[colorKey];
        if (color === SAME_AS_USER) return;
        if (color === 'accent') color = 'var(--mt-accent)';
        if (color == null && fallbackToCurrentColor) color = 'currentColor';
        if (!color) return;
        migrated[colorKey] = `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
    };
    for (const prefix of ['character', 'user']) {
        mergeLegacyOpacityIntoColor(`${prefix}NameColor`, `${prefix}NameOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}MessageBackgroundColor`, `${prefix}MessageBackgroundOpacity`);
        mergeLegacyOpacityIntoColor(`${prefix}TextColor`, `${prefix}NormalOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}DialogueColor`, `${prefix}DialogueOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}EmphasisColor`, `${prefix}EmphasisOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}QuoteColor`, `${prefix}QuoteOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}QuoteBackground`, `${prefix}QuoteOpacity`);
        mergeLegacyOpacityIntoColor(`${prefix}QuoteBorderColor`, `${prefix}QuoteOpacity`);
        mergeLegacyOpacityIntoColor(`${prefix}LinkColor`, `${prefix}LinkOpacity`, true);
        mergeLegacyOpacityIntoColor(`${prefix}LinkHoverColor`, `${prefix}LinkOpacity`);
        mergeLegacyOpacityIntoColor(`${prefix}LinkVisitedColor`, `${prefix}LinkOpacity`);
    }
    migratePair('avatarBorder', 'characterAvatarBorder', 'userAvatarBorder');
    migratePair('avatarSize', 'characterAvatarSize', 'userAvatarSize');
    migratePair('messageTextFontSize', 'characterMessageTextFontSize', 'userMessageTextFontSize');
    migratePair('paragraphSpacingTop', 'characterParagraphSpacingTop', 'userParagraphSpacingTop');
    migratePair('paragraphSpacingBottom', 'characterParagraphSpacingBottom', 'userParagraphSpacingBottom');

    const output = {};
    for (const definition of CHAT_APPEARANCE_DEFINITIONS) output[definition.key] = normalizedValue(definition, migrated[definition.key]);
    return output;
}

function isDefaultAppearance(value) {
    return CHAT_APPEARANCE_DEFINITIONS.every(definition => normalizedValue(definition, value?.[definition.key]) === null);
}

function countOverrides(values, role = null, group = null) {
    return CHAT_APPEARANCE_DEFINITIONS.filter(definition => (!role || definition.role === role) && (!group || definition.group === group))
        .reduce((count, definition) => count + (normalizedValue(definition, values?.[definition.key]) !== null ? 1 : 0), 0);
}

function formatNumber(definition, value) {
    if (!Number.isFinite(Number(value))) return '';
    const decimals = String(definition.step || 1).includes('.') ? String(definition.step).split('.')[1].length : 0;
    const numeric = decimals ? Number(value).toFixed(decimals) : String(Math.round(Number(value)));
    return `${numeric}${definition.unit ? ` ${definition.unit}` : ''}`;
}

function colorPickerValue(value, fallback = '#7c6cff') {
    const candidate = String(value || '').trim();
    if (/^#[0-9a-f]{8}$/i.test(candidate)) return candidate.slice(0, 7);
    if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate;
    if (/^#[0-9a-f]{4}$/i.test(candidate)) {
        const rgb = candidate.slice(1, 4).split('').map(char => char + char).join('');
        return `#${rgb}`;
    }
    if (/^#[0-9a-f]{3}$/i.test(candidate)) return `#${candidate.slice(1).split('').map(char => char + char).join('')}`;
    const rgb = candidate.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (rgb) {
        const byte = part => Math.max(0, Math.min(255, Math.round(Number(part) || 0))).toString(16).padStart(2, '0');
        return `#${byte(rgb[1])}${byte(rgb[2])}${byte(rgb[3])}`;
    }
    return /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#7c6cff';
}

function colorAlphaValue(value) {
    const candidate = String(value || '').trim();
    if (/^#[0-9a-f]{8}$/i.test(candidate)) return parseInt(candidate.slice(7, 9), 16) / 255;
    if (/^#[0-9a-f]{4}$/i.test(candidate)) return parseInt(candidate.slice(4, 5).repeat(2), 16) / 255;
    const rgba = candidate.match(/^rgba\(\s*[\d.]+\s*[, ]\s*[\d.]+\s*[, ]\s*[\d.]+\s*[, /]\s*([\d.]+)%?\s*\)$/i);
    if (!rgba) return 1;
    const raw = Number(rgba[1]);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0, Math.min(1, candidate.includes('%') ? raw / 100 : raw));
}

function rgbaFromPicker(hex, alpha = 1) {
    const candidate = colorPickerValue(hex);
    const r = parseInt(candidate.slice(1, 3), 16);
    const g = parseInt(candidate.slice(3, 5), 16);
    const b = parseInt(candidate.slice(5, 7), 16);
    const a = Math.max(0, Math.min(1, Number(alpha)));
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function rgbaEditorValue(value, fallback = '#7c6cff') {
    const candidate = String(value || '').trim();
    if (!candidate || candidate === 'accent' || candidate === SAME_AS_USER) return rgbaFromPicker(fallback, 1);
    if (/^#[0-9a-f]{3,4}$/i.test(candidate) || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(candidate) || /^rgba?\(/i.test(candidate)) {
        return rgbaFromPicker(colorPickerValue(candidate, fallback), colorAlphaValue(candidate));
    }
    return candidate;
}

function alphaPercentValue(value) {
    return String(Math.round(colorAlphaValue(value) * 100));
}

function normalizePresetName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function presetId() {
    try { return `nt-${crypto.randomUUID()}`; } catch (_) { return `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
}

export function normalizeChatAppearanceSettings(settings) {
    settings.chatAppearance = cleanAppearanceObject(settings.chatAppearance);
    if (!settings.characterChatAppearance || typeof settings.characterChatAppearance !== 'object' || Array.isArray(settings.characterChatAppearance)) settings.characterChatAppearance = {};
    for (const [key, value] of Object.entries(settings.characterChatAppearance)) {
        const clean = cleanAppearanceObject(value);
        if (isDefaultAppearance(clean)) delete settings.characterChatAppearance[key];
        else settings.characterChatAppearance[key] = clean;
    }

    if (!settings.chatAppearancePresets || typeof settings.chatAppearancePresets !== 'object' || Array.isArray(settings.chatAppearancePresets)) settings.chatAppearancePresets = {};
    for (const [id, preset] of Object.entries(settings.chatAppearancePresets)) {
        const name = normalizePresetName(preset?.name);
        if (!name || !preset || typeof preset !== 'object') {
            delete settings.chatAppearancePresets[id];
            continue;
        }
        settings.chatAppearancePresets[id] = {
            name,
            values: cleanAppearanceObject(preset.values),
            updatedAt: Number.isFinite(Number(preset.updatedAt)) ? Number(preset.updatedAt) : Date.now(),
        };
    }

    if (!settings.chatAppearancePresetSelection || typeof settings.chatAppearancePresetSelection !== 'object' || Array.isArray(settings.chatAppearancePresetSelection)) settings.chatAppearancePresetSelection = { global: '', cards: {} };
    settings.chatAppearancePresetSelection.global = String(settings.chatAppearancePresetSelection.global || '');
    if (!settings.chatAppearancePresetSelection.cards || typeof settings.chatAppearancePresetSelection.cards !== 'object' || Array.isArray(settings.chatAppearancePresetSelection.cards)) settings.chatAppearancePresetSelection.cards = {};

    const seedVersion = Number(settings.chatAppearancePresetSeedVersion || 0);
    if (seedVersion < CHAT_APPEARANCE_PRESET_SEED_VERSION) {
        for (const preset of FACTORY_PRESETS) {
            if (!settings.chatAppearancePresets[preset.id]) {
                settings.chatAppearancePresets[preset.id] = {
                    name: preset.name,
                    values: factoryPresetValues(preset.kind),
                    updatedAt: Date.now(),
                };
            }
        }
        settings.chatAppearancePresetSeedVersion = CHAT_APPEARANCE_PRESET_SEED_VERSION;
    }

    const validPresetIds = new Set(Object.keys(settings.chatAppearancePresets));
    if (!validPresetIds.has(settings.chatAppearancePresetSelection.global)) settings.chatAppearancePresetSelection.global = '';
    for (const [key, id] of Object.entries(settings.chatAppearancePresetSelection.cards)) {
        if (!validPresetIds.has(String(id || ''))) delete settings.chatAppearancePresetSelection.cards[key];
    }
    return settings;
}

export class ChatAppearanceManager {
    constructor(settings, toast) {
        this.settings = settings;
        this.toast = toast;
        this.root = null;
        this.modalIdentity = null;
        this.lastAppliedSignature = '';
        this.expandedSections = { card: new Set(), global: new Set() };
        this.activeRole = { card: 'user', global: 'user' };
        this.activeGroup = { card: 'Avatar', global: 'Avatar' };
        this.activeCategory = { card: 'Visibility & layout', global: 'Visibility & layout' };
        this.scrollPosition = { card: 0, global: 0 };
        const presetSeedVersion = Number(this.settings.chatAppearancePresetSeedVersion || 0);
        normalizeChatAppearanceSettings(this.settings);
        if (presetSeedVersion !== Number(this.settings.chatAppearancePresetSeedVersion || 0)) saveSettings();
    }

    mount() { this.sync(); }

    refreshSettings() {
        normalizeChatAppearanceSettings(this.settings);
        this.sync();
    }

    unmount() {
        this.close({ immediate: true });
        this.root?.remove();
        this.root = null;
        this.modalIdentity = null;
        this.lastAppliedSignature = '';
        this.expandedSections = { card: new Set(), global: new Set() };
        this.activeRole = { card: 'user', global: 'user' };
        this.activeGroup = { card: 'Avatar', global: 'Avatar' };
        this.activeCategory = { card: 'Visibility & layout', global: 'Visibility & layout' };
        this.scrollPosition = { card: 0, global: 0 };
        this.clearAppliedStyles();
    }

    getCharacterIdentity() {
        const context = getContextSafe();
        if (!context) return null;
        const groupId = context.groupId ?? context.group_id ?? null;
        if (groupId !== null && groupId !== undefined && groupId !== '') return null;
        const characterId = context.characterId ?? context.character_id ?? null;
        if (characterId === null || characterId === undefined) return null;
        const character = context.characters?.[characterId];
        if (!character) return null;
        const avatar = String(character.avatar || '').trim();
        const name = String(character.name || context.name2 || t('Character')).trim() || t('Character');
        const key = avatar ? `avatar:${avatar}` : `character:${characterId}:${name}`;
        return { key, name, avatar, characterId };
    }

    getGlobalValues() {
        this.settings.chatAppearance = cleanAppearanceObject(this.settings.chatAppearance);
        return this.settings.chatAppearance;
    }

    getCardValues(identity = this.getCharacterIdentity(), create = false) {
        if (!identity) return cleanAppearanceObject(null);
        this.settings.characterChatAppearance ??= {};
        const current = this.settings.characterChatAppearance[identity.key];
        if (!current && !create) return cleanAppearanceObject(null);
        const clean = cleanAppearanceObject(current);
        if (create) this.settings.characterChatAppearance[identity.key] = clean;
        return clean;
    }

    getPresets() {
        if (!this.settings.chatAppearancePresets || typeof this.settings.chatAppearancePresets !== 'object' || Array.isArray(this.settings.chatAppearancePresets)) this.settings.chatAppearancePresets = {};
        return this.settings.chatAppearancePresets;
    }

    getActivePresetId(scope, identity = scope === 'card' ? this.modalIdentity : null) {
        const selection = this.settings.chatAppearancePresetSelection || { global: '', cards: {} };
        const id = scope === 'card' ? String(selection.cards?.[identity?.key] || '') : String(selection.global || '');
        return this.getPresets()[id] ? id : '';
    }

    setActivePresetId(scope, identity, id) {
        this.settings.chatAppearancePresetSelection ??= { global: '', cards: {} };
        this.settings.chatAppearancePresetSelection.cards ??= {};
        const validId = id && this.getPresets()[id] ? id : '';
        if (scope === 'card') {
            if (!identity) return;
            if (validId) this.settings.chatAppearancePresetSelection.cards[identity.key] = validId;
            else delete this.settings.chatAppearancePresetSelection.cards[identity.key];
        } else {
            this.settings.chatAppearancePresetSelection.global = validId;
        }
    }

    orderedPresets() {
        return Object.entries(this.getPresets())
            .map(([id, preset]) => ({ id, ...preset }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    }

    uniquePresetName(requested, excludeId = '') {
        const base = normalizePresetName(requested) || t('New preset');
        const taken = new Set(this.orderedPresets().filter(preset => preset.id !== excludeId).map(preset => preset.name.toLocaleLowerCase()));
        if (!taken.has(base.toLocaleLowerCase())) return base;
        let index = 2;
        while (taken.has(`${base} ${index}`.toLocaleLowerCase())) index += 1;
        return `${base} ${index}`;
    }

    autosaveActivePreset(scope, identity, values) {
        const id = this.getActivePresetId(scope, identity);
        if (!id) return;
        const preset = this.getPresets()[id];
        if (!preset) return;
        preset.values = cleanAppearanceObject(values);
        preset.updatedAt = Date.now();
    }

    async askPresetName(title, defaultValue) {
        try {
            const context = getContextSafe();
            if (context?.Popup?.show?.input) return normalizePresetName(await context.Popup.show.input(title, null, defaultValue));
        } catch (_) {}
        return normalizePresetName(window.prompt(title, defaultValue) || '');
    }

    async addPreset(scope) {
        const identity = scope === 'card' ? this.modalIdentity : null;
        if (scope === 'card' && !identity) return;
        const requested = await this.askPresetName(t('Add Chat Appearance preset'), t('New preset'));
        if (!requested) return;
        const id = presetId();
        const name = this.uniquePresetName(requested);
        const values = structuredClone(this.valuesForScope(scope, identity));
        this.getPresets()[id] = { name, values: cleanAppearanceObject(values), updatedAt: Date.now() };
        this.setActivePresetId(scope, identity, id);
        saveSettings();
        this.rerenderScope(scope);
        this.toast?.(t('Preset created and autosave enabled.'));
    }

    async renameActivePreset(scope) {
        const identity = scope === 'card' ? this.modalIdentity : null;
        const id = this.getActivePresetId(scope, identity);
        const preset = this.getPresets()[id];
        if (!preset) return;
        const requested = await this.askPresetName(t('Rename Chat Appearance preset'), preset.name);
        if (!requested) return;
        preset.name = this.uniquePresetName(requested, id);
        preset.updatedAt = Date.now();
        saveSettings();
        this.rerenderScope(scope);
    }

    async deleteActivePreset(scope) {
        const identity = scope === 'card' ? this.modalIdentity : null;
        const id = this.getActivePresetId(scope, identity);
        const preset = this.getPresets()[id];
        if (!preset) return;
        if (!await confirmDialog(t('Delete preset “{name}”?', { name: preset.name }))) return;
        delete this.settings.chatAppearancePresets[id];
        if (this.settings.chatAppearancePresetSelection?.global === id) this.settings.chatAppearancePresetSelection.global = '';
        for (const [key, selected] of Object.entries(this.settings.chatAppearancePresetSelection?.cards || {})) {
            if (selected === id) delete this.settings.chatAppearancePresetSelection.cards[key];
        }
        saveSettings();
        this.rerenderScope(scope);
    }

    selectPreset(scope, id) {
        const identity = scope === 'card' ? this.modalIdentity : null;
        if (scope === 'card' && !identity) return;
        if (!id) {
            this.setActivePresetId(scope, identity, '');
            saveSettings();
            this.rerenderScope(scope);
            return;
        }
        const preset = this.getPresets()[id];
        if (!preset) return;
        const values = cleanAppearanceObject(preset.values);
        if (scope === 'card') {
            if (isDefaultAppearance(values)) delete this.settings.characterChatAppearance?.[identity.key];
            else this.settings.characterChatAppearance[identity.key] = structuredClone(values);
        } else {
            this.settings.chatAppearance = structuredClone(values);
        }
        this.setActivePresetId(scope, identity, id);
        saveSettings();
        this.sync();
        if (scope === 'card') this.modalIdentity = this.getCharacterIdentity();
        this.rerenderScope(scope);
    }

    exportActivePreset(scope) {
        const identity = scope === 'card' ? this.modalIdentity : null;
        const id = this.getActivePresetId(scope, identity);
        const preset = this.getPresets()[id];
        if (!preset) {
            this.toast?.(t('Select a preset to export.'));
            return;
        }
        const payload = {
            format: CHAT_APPEARANCE_PRESET_FORMAT,
            version: CHAT_APPEARANCE_PRESET_VERSION,
            name: preset.name,
            values: cleanAppearanceObject(preset.values),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(blob);
        const slug = preset.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'chat-appearance';
        anchor.download = `nastytavern-chat-appearance-${slug}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    }

    async importPresetFile(scope, file) {
        if (!file) return;
        const identity = scope === 'card' ? this.modalIdentity : null;
        if (scope === 'card' && !identity) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (parsed?.format !== CHAT_APPEARANCE_PRESET_FORMAT || Number(parsed.version) !== CHAT_APPEARANCE_PRESET_VERSION || !parsed.values) throw new Error('invalid');
            const id = presetId();
            const name = this.uniquePresetName(parsed.name || t('Imported preset'));
            this.getPresets()[id] = { name, values: cleanAppearanceObject(parsed.values), updatedAt: Date.now() };
            this.selectPreset(scope, id);
            this.toast?.(t('Chat Appearance preset imported.'));
        } catch (_) {
            this.toast?.(t('Invalid Chat Appearance preset file.'));
        }
    }

    rerenderScope(scope) {
        if (scope === 'card') this.renderModal();
        else this.requestGlobalRender?.();
    }

    hasCardOverrides(identity = this.getCharacterIdentity()) {
        if (!identity) return false;
        return !isDefaultAppearance(this.getCardValues(identity));
    }

    getEffectiveValues(identity = this.getCharacterIdentity()) {
        const globalValues = this.getGlobalValues();
        const cardValues = identity ? this.getCardValues(identity) : null;
        const effective = {};
        for (const definition of CHAT_APPEARANCE_DEFINITIONS) {
            const local = cardValues ? normalizedValue(definition, cardValues[definition.key]) : null;
            effective[definition.key] = local !== null ? local : normalizedValue(definition, globalValues[definition.key]);
        }
        for (const definition of CHAT_APPEARANCE_DEFINITIONS) {
            if (effective[definition.key] !== SAME_AS_USER) continue;
            const userDefinition = matchingUserDefinition(definition);
            effective[definition.key] = userDefinition ? normalizedValue(userDefinition, effective[userDefinition.key]) : null;
        }
        return effective;
    }

    sync() {
        const identity = this.getCharacterIdentity();
        if (this.root && !this.root.hidden && this.modalIdentity?.key !== identity?.key) this.close({ immediate: true });
        const effective = this.getEffectiveValues(identity);
        const signature = CHAT_APPEARANCE_DEFINITIONS.map(definition => `${definition.key}:${String(effective[definition.key])}`).join('|');
        if (signature !== this.lastAppliedSignature) {
            this.lastAppliedSignature = signature;
            this.applyEffective(effective);
        }
        return identity;
    }

    clearAppliedStyles() {
        document.body?.classList.remove(...ownedBodyClasses);
        const root = document.documentElement;
        for (const variable of ownedCssVariables) root.style.removeProperty(variable);
    }

    applyEffective(values) {
        this.clearAppliedStyles();
        const body = document.body;
        const root = document.documentElement;
        if (!body) return;
        for (const definition of CHAT_APPEARANCE_DEFINITIONS) {
            const value = normalizedValue(definition, values[definition.key]);
            if (value === null) continue;
            if (definition.type === 'boolean' && definition.trueClass && definition.falseClass) {
                body.classList.add(value ? definition.trueClass : definition.falseClass);
                continue;
            }
            if (definition.type === 'enum' && definition.classPrefix) {
                body.classList.add(`${definition.classPrefix}${value}`);
                continue;
            }
            if (definition.className) body.classList.add(definition.className);
            if (!definition.cssVar) continue;
            if (definition.type === 'color') {
                const cssValue = value === 'accent' ? (definition.accentValue || 'var(--mt-accent)') : value;
                root.style.setProperty(definition.cssVar, cssValue);
            } else {
                const cssValue = typeof definition.transform === 'function' ? definition.transform(value) : `${value}${definition.unit || ''}`;
                root.style.setProperty(definition.cssVar, cssValue);
            }
        }
    }

    previewColorValue(definition, value) {
        const body = document.body;
        const root = document.documentElement;
        if (!body || definition?.type !== 'color') return;
        if (definition.className) body.classList.add(definition.className);
        if (!definition.cssVar) return;
        root.style.setProperty(definition.cssVar, value);
    }

    previewNumberValue(definition, value) {
        const body = document.body;
        const root = document.documentElement;
        const numeric = numberValue(definition, value);
        if (!body || definition?.type !== 'number' || numeric === null) return;
        if (definition.className) body.classList.add(definition.className);
        if (!definition.cssVar) return;
        const cssValue = typeof definition.transform === 'function' ? definition.transform(numeric) : `${numeric}${definition.unit || ''}`;
        root.style.setProperty(definition.cssVar, cssValue);
    }

    ensure() {
        if (this.root?.isConnected) {
            ensureModalOpacityControl(this.root);
            return this.root;
        }
        const { root } = createModalShell({
            id: 'nt-chat-appearance-modal',
            title: t('Chat appearance'),
            subtitle: t('Per-character presentation overrides'),
            icon: icons.sliders || icons.settings,
            size: 'large',
            modalClass: 'nt-tool-modal nt-chat-appearance-modal',
            bodyClass: 'nt-chat-appearance-body',
            bodyAttrs: { 'data-nt-chat-appearance-body': '' },
            closeAttrs: { 'data-nt-chat-appearance-close': '' },
            includeOpacityControl: true,
        });
        root.addEventListener('click', event => this.onModalClick(event));
        root.addEventListener('input', event => this.onModalInput(event));
        root.addEventListener('change', event => this.onModalChange(event));
        document.body.append(root);
        this.root = root;
        return root;
    }

    open() {
        const identity = this.getCharacterIdentity();
        if (!identity) {
            this.toast?.(t('Select a Character Card in a single-character chat to customize its chat appearance.'));
            return false;
        }
        this.ensure();
        ensureModalOpacityControl(this.root);
        this.modalIdentity = identity;
        this.renderModal();
        showModalShell(this.root);
        return true;
    }

    close({ immediate = false } = {}) {
        if (!this.root || this.root.hidden) return;
        hideModalShell(this.root, { immediate });
        this.modalIdentity = null;
    }

    renderModal() {
        if (!this.root || !this.modalIdentity) return;
        const body = this.root.querySelector('[data-nt-chat-appearance-body]');
        if (!body) return;
        this.captureScrollPosition('card');
        const values = this.getCardValues(this.modalIdentity);
        const effective = this.getEffectiveValues(this.modalIdentity);
        body.innerHTML = this.renderWorkspace(values, {
            scope: 'card',
            effective,
            title: this.modalIdentity.name,
            subtitle: 'Per-character overrides. Inherit follows the global NastyTavern value.',
        });
        this.scheduleScrollRestore('card');
    }

    captureScrollPosition(scope) {
        const body = scope === 'card' ? this.root?.querySelector('[data-nt-chat-appearance-body]') : document.querySelector('#nt-preferences [data-nt-pref-body]');
        if (body) this.scrollPosition[scope] = body.scrollTop || 0;
    }

    scheduleScrollRestore(scope) {
        const value = this.scrollPosition[scope] || 0;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const body = scope === 'card' ? this.root?.querySelector('[data-nt-chat-appearance-body]') : document.querySelector('#nt-preferences [data-nt-pref-body]');
            if (body) body.scrollTop = value;
        }));
    }

    renderGlobalSettings() {
        this.captureScrollPosition('global');
        const values = this.getGlobalValues();
        queueMicrotask(() => this.scheduleScrollRestore('global'));
        return `<div class="nt-pref-interface nt-chat-appearance-settings">${this.renderWorkspace(values, {
            scope: 'global',
            effective: values,
            title: t('Chat appearance'),
            subtitle: t('Global defaults. Character Card overrides inherit these values unless changed.'),
        })}</div>`;
    }

    captureExpandedSections() {}

    renderWorkspace(values, { scope, effective, title, subtitle }) {
        const role = this.activeRole[scope] || 'user';
        const group = groups.includes(this.activeGroup[scope]) ? this.activeGroup[scope] : groups[0];
        this.activeGroup[scope] = group;
        const categories = categoriesFor(role, group);
        const category = categories.includes(this.activeCategory[scope]) ? this.activeCategory[scope] : categories[0];
        this.activeCategory[scope] = category;
        const total = countOverrides(values);
        const identity = scope === 'card' ? this.modalIdentity : null;
        const activePresetId = this.getActivePresetId(scope, identity);
        const presets = this.orderedPresets();
        const activePreset = activePresetId ? this.getPresets()[activePresetId] : null;
        const resetAttr = scope === 'card' ? 'data-nt-chat-appearance-reset-card' : 'data-nt-chat-appearance-reset-global';
        const scopeLabel = scope === 'card' ? t('overrides') : t('custom defaults');
        return `
          <section class="nt-chat-appearance-workspace" data-nt-chat-appearance-workspace="${scope}">
            <header class="nt-chat-appearance-overview">
              <div class="nt-chat-appearance-overview-copy">
                <b ${scope === 'card' ? 'data-nt-no-i18n' : ''}>${esc(title)}</b>
                <small>${esc(t(subtitle))}</small>
              </div>
              <div class="nt-chat-appearance-overview-actions">
                <span class="nt-chat-appearance-count">${total} ${scopeLabel}</span>
                <button type="button" class="nt-pref-action-button" ${resetAttr}>${scope === 'card' ? t('Reset all to Inherit') : t('Reset')}</button>
              </div>
            </header>
            <div class="nt-chat-appearance-preset-manager" data-nt-chat-appearance-preset-manager="${scope}">
              <label class="nt-chat-appearance-preset-select">
                <span>${t('Preset')}</span>
                <select data-nt-chat-appearance-preset-select data-nt-chat-appearance-scope="${scope}" aria-label="${esc(t('Chat Appearance preset'))}">
                  <option value="" ${activePresetId ? '' : 'selected'}>${t('Custom / no preset')}</option>
                  ${presets.map(preset => `<option value="${esc(preset.id)}" ${activePresetId === preset.id ? 'selected' : ''}>${esc(preset.name)}</option>`).join('')}
                </select>
              </label>
              <span class="nt-chat-appearance-preset-status${activePreset ? ' is-active' : ''}">${activePreset ? `${t('Autosave')} · ${esc(activePreset.name)}` : t('Preset autosave off')}</span>
              <div class="nt-chat-appearance-preset-actions">
                <button type="button" class="nt-chat-appearance-icon-button" data-nt-chat-appearance-preset-add data-nt-chat-appearance-scope="${scope}" title="${esc(t('Add preset'))}" aria-label="${esc(t('Add preset'))}">${icons.plus}</button>
                <button type="button" class="nt-chat-appearance-icon-button" data-nt-chat-appearance-preset-rename data-nt-chat-appearance-scope="${scope}" title="${esc(t('Rename current preset'))}" aria-label="${esc(t('Rename current preset'))}" ${activePreset ? '' : 'disabled'}>${icons.edit}</button>
                <button type="button" class="nt-chat-appearance-icon-button" data-nt-chat-appearance-preset-import data-nt-chat-appearance-scope="${scope}" title="${esc(t('Import preset'))}" aria-label="${esc(t('Import preset'))}">${icons.download}</button>
                <button type="button" class="nt-chat-appearance-icon-button" data-nt-chat-appearance-preset-export data-nt-chat-appearance-scope="${scope}" title="${esc(t('Export current preset'))}" aria-label="${esc(t('Export current preset'))}" ${activePreset ? '' : 'disabled'}>${icons.upload}</button>
                <button type="button" class="nt-chat-appearance-icon-button is-danger" data-nt-chat-appearance-preset-delete data-nt-chat-appearance-scope="${scope}" title="${esc(t('Delete current preset'))}" aria-label="${esc(t('Delete current preset'))}" ${activePreset ? '' : 'disabled'}>${icons.trash}</button>
                <input type="file" accept="application/json,.json" hidden data-nt-chat-appearance-preset-file data-nt-chat-appearance-scope="${scope}">
              </div>
            </div>
            <nav class="nt-chat-appearance-role-tabs" aria-label="${esc(t('Message role'))}">
              ${roles.map(item => {
                  const count = countOverrides(values, item.id);
                  return `<button type="button" class="nt-chat-appearance-role-tab${role === item.id ? ' is-active' : ''}" data-nt-chat-appearance-role="${item.id}" data-nt-chat-appearance-scope="${scope}" aria-pressed="${role === item.id}">
                    <span>${t(item.label)}</span>${count ? `<span class="nt-chat-appearance-role-count">${count}</span>` : ''}
                  </button>`;
              }).join('')}
            </nav>
            <nav class="nt-chat-appearance-subtabs" aria-label="${esc(t('Appearance area'))}">
              ${groups.map(item => {
                  const count = countOverrides(values, role, item);
                  return `<button type="button" class="nt-chat-appearance-subtab${group === item ? ' is-active' : ''}" data-nt-chat-appearance-group="${esc(item)}" data-nt-chat-appearance-scope="${scope}" aria-pressed="${group === item}">
                    <span>${t(item)}</span>${count ? `<span>${count}</span>` : ''}
                  </button>`;
              }).join('')}
            </nav>
            <div class="nt-chat-appearance-editor">
              <aside class="nt-chat-appearance-category-nav" aria-label="${esc(t('Categories'))}">
                ${categories.map(item => {
                    const count = categoryCount(values, role, group, item);
                    return `<button type="button" class="nt-chat-appearance-category${category === item ? ' is-active' : ''}" data-nt-chat-appearance-category="${esc(item)}" data-nt-chat-appearance-scope="${scope}" aria-pressed="${category === item}">
                      <span>${t(item)}</span>${count ? `<span class="nt-chat-appearance-category-status"><i aria-hidden="true"></i><small>${count}</small></span>` : ''}
                    </button>`;
                }).join('')}
              </aside>
              <main class="nt-chat-appearance-category-panel">
                ${this.renderCategory(values, { scope, effective, role, group, category })}
              </main>
            </div>
          </section>`;
    }

    renderCategory(values, { scope, effective, role, group, category }) {
        const items = CHAT_APPEARANCE_DEFINITIONS.filter(definition => definition.role === role && definition.group === group && definition.category === category);
        const count = categoryCount(values, role, group, category);
        const sectionNames = [...new Set(items.map(controlSection))];
        return `<section class="nt-chat-appearance-category-content">
          <header class="nt-chat-appearance-category-header">
            <div><b>${t(category)}</b><small>${t(group)} · ${t(role === 'user' ? 'User' : 'Character')}</small></div>
            <div class="nt-chat-appearance-category-header-actions">
              <span>${count ? `${count} ${t('active')}` : (scope === 'card' ? t('Inherit') : t('Theme'))}</span>
              <button type="button" class="nt-chat-appearance-category-action" data-nt-chat-appearance-reset-category data-nt-chat-appearance-role="${role}" data-nt-chat-appearance-group="${esc(group)}" data-nt-chat-appearance-category="${esc(category)}" data-nt-chat-appearance-scope="${scope}">${t('Reset category')}</button>
              ${role === 'user' ? `<button type="button" class="nt-chat-appearance-category-action" data-nt-chat-appearance-copy-category="user-to-character" data-nt-chat-appearance-group="${esc(group)}" data-nt-chat-appearance-category="${esc(category)}" data-nt-chat-appearance-scope="${scope}">${t('Copy to Character')}</button>` : `<button type="button" class="nt-chat-appearance-category-action" data-nt-chat-appearance-copy-category="character-to-user" data-nt-chat-appearance-group="${esc(group)}" data-nt-chat-appearance-category="${esc(category)}" data-nt-chat-appearance-scope="${scope}">${t('Copy to User')}</button>`}
            </div>
          </header>
          <div class="nt-chat-appearance-category-controls">${sectionNames.map(section => `<section class="nt-chat-appearance-control-section"><h4>${t(section)}</h4><div class="nt-chat-appearance-control-section-body">${items.filter(definition => controlSection(definition) === section).sort((a, b) => controlRank(a) - controlRank(b)).map(definition => this.renderControl(definition, values, scope, effective)).join('')}</div></section>`).join('')}</div>
        </section>`;
    }

    dependencyDisabled(definition, effective) {
        if (!definition.dependsOn) return false;
        return effective?.[definition.dependsOn] === false;
    }

    renderResetButton(definition, scope, disabled = false) {
        return `<button type="button" class="nt-chat-appearance-control-reset" data-nt-chat-appearance-reset-key="${definition.key}" data-nt-chat-appearance-scope="${scope}" title="${esc(t('Reset to default'))}" aria-label="${esc(t('Reset {label} to default', { label: t(definition.label) }))}" ${disabled ? 'disabled' : ''}>${icons.undo || icons.refresh}</button>`;
    }

    renderControl(definition, values, scope, effective) {
        const stored = normalizedValue(definition, values?.[definition.key]);
        const dependencyHidden = this.dependencyDisabled(definition, effective);
        const disabled = dependencyHidden ? 'disabled' : '';
        const disabledClass = dependencyHidden ? ' is-disabled' : '';
        const scopeLabel = scope === 'card' ? t('Inherit') : t('Theme');

        if (definition.type === 'boolean') {
            const onLabel = t(definition.onLabel || 'Show');
            const offLabel = t(definition.offLabel || 'Hide');
            const selected = stored === null ? 'default' : stored === SAME_AS_USER ? SAME_AS_USER : stored ? 'on' : 'off';
            return `<div class="nt-pref-setting-row${disabledClass}">
              <span><b>${t(definition.label)}</b><small>${t(definition.hint)}</small></span>
              <select data-nt-chat-appearance-control data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${disabled}>
                <option value="default" ${selected === 'default' ? 'selected' : ''}>${scopeLabel}</option>
                ${definition.role === 'character' ? `<option value="${SAME_AS_USER}" ${selected === SAME_AS_USER ? 'selected' : ''}>${t('Same as User')}</option>` : ''}
                <option value="on" ${selected === 'on' ? 'selected' : ''}>${onLabel}</option>
                <option value="off" ${selected === 'off' ? 'selected' : ''}>${offLabel}</option>
              </select>
              ${this.renderResetButton(definition, scope, false)}
            </div>`;
        }

        if (definition.type === 'enum') {
            return `<div class="nt-pref-setting-row${disabledClass}">
              <span><b>${t(definition.label)}</b><small>${t(definition.hint)}</small></span>
              <select data-nt-chat-appearance-control data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${disabled}>
                <option value="default" ${stored === null ? 'selected' : ''}>${scopeLabel}</option>
                ${definition.role === 'character' ? `<option value="${SAME_AS_USER}" ${stored === SAME_AS_USER ? 'selected' : ''}>${t('Same as User')}</option>` : ''}
                ${(definition.options || []).map(option => `<option value="${option.value}" ${stored === option.value ? 'selected' : ''}>${t(option.label)}</option>`).join('')}
              </select>
              ${this.renderResetButton(definition, scope, false)}
            </div>`;
        }

        if (definition.type === 'color') return this.renderColorControl(definition, values, scope, effective, dependencyHidden);

        const sameAsUser = stored === SAME_AS_USER;
        const custom = stored !== null && !sameAsUser;
        const inherited = normalizedValue(definition, effective?.[definition.key]);
        const rangeValue = custom ? stored : (inherited ?? definition.fallback);
        const output = custom ? formatNumber(definition, rangeValue) : (inherited !== null && inherited !== SAME_AS_USER ? formatNumber(definition, inherited) : t('Theme'));
        return `<div class="nt-pref-setting-row nt-chat-appearance-number-row${disabledClass}">
          <span><b>${t(definition.label)}</b><small>${t(definition.hint)}</small></span>
          <span class="nt-chat-appearance-number-control">
            <select data-nt-chat-appearance-mode data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${disabled}>
              <option value="default" ${stored === null ? 'selected' : ''}>${scopeLabel}</option>
              ${definition.role === 'character' ? `<option value="${SAME_AS_USER}" ${sameAsUser ? 'selected' : ''}>${t('Same as User')}</option>` : ''}
              <option value="custom" ${custom ? 'selected' : ''}>${t('Custom')}</option>
            </select>
            <span class="nt-chat-appearance-number-editor">
              <input type="range" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${rangeValue}" data-nt-chat-appearance-range data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${custom && !dependencyHidden ? '' : 'disabled'} aria-label="${esc(t(definition.label))}">
              <span class="nt-chat-appearance-number-field">
                <input type="number" inputmode="decimal" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${rangeValue}" data-nt-chat-appearance-value data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${custom && !dependencyHidden ? '' : 'disabled'}>
                ${definition.unit ? `<span>${esc(definition.unit)}</span>` : ''}
              </span>
            </span>
            <output data-nt-chat-appearance-output="${definition.key}">${sameAsUser ? t('Same as User') : output}</output>
          </span>
          ${this.renderResetButton(definition, scope, false)}
        </div>`;
    }

    renderColorControl(definition, values, scope, effective, dependencyHidden) {
        const stored = normalizedValue(definition, values?.[definition.key]);
        const inherited = normalizedValue(definition, effective?.[definition.key]);
        const mode = stored === null ? 'default' : stored === 'accent' ? 'accent' : stored === SAME_AS_USER ? SAME_AS_USER : 'custom';
        const rawCustomValue = mode === 'custom' ? stored : (inherited && inherited !== 'accent' ? inherited : (this.settings.accent || '#7c6cff'));
        const customValue = rgbaEditorValue(rawCustomValue, this.settings.accent || '#7c6cff');
        const picker = colorPickerValue(customValue, this.settings.accent);
        const alphaPercent = alphaPercentValue(customValue);
        const scopeLabel = scope === 'card' ? t('Inherit') : t('Theme');
        return `<div class="nt-pref-setting-row nt-chat-appearance-color-row${dependencyHidden ? ' is-disabled' : ''}">
          <span><b>${t(definition.label)}</b><small>${t(definition.hint)}</small></span>
          <span class="nt-chat-appearance-color-control">
            <select data-nt-chat-appearance-color-mode data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${dependencyHidden ? 'disabled' : ''}>
              <option value="default" ${mode === 'default' ? 'selected' : ''}>${scopeLabel}</option>
              <option value="accent" ${mode === 'accent' ? 'selected' : ''}>${t('Accent')}</option>
              ${definition.role === 'character' ? `<option value="${SAME_AS_USER}" ${mode === SAME_AS_USER ? 'selected' : ''}>${t('Same as User')}</option>` : ''}
              <option value="custom" ${mode === 'custom' ? 'selected' : ''}>${t('Custom')}</option>
            </select>
            <span class="nt-chat-appearance-color-custom${mode === 'custom' ? ' is-active' : ''}">
              <input type="color" value="${picker}" data-nt-chat-appearance-color-picker data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${mode === 'custom' && !dependencyHidden ? '' : 'disabled'} aria-label="${esc(t('Color picker'))}">
              <span class="nt-chat-appearance-alpha-control" title="${esc(t('Alpha'))}">
                <span aria-hidden="true">A</span>
                <input type="range" min="0" max="100" step="1" value="${alphaPercent}" data-nt-chat-appearance-color-alpha data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${mode === 'custom' && !dependencyHidden ? '' : 'disabled'} aria-label="${esc(t('Color alpha'))}">
                <input type="number" inputmode="decimal" min="0" max="100" step="1" value="${alphaPercent}" data-nt-chat-appearance-color-alpha-value data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${mode === 'custom' && !dependencyHidden ? '' : 'disabled'} aria-label="${esc(t('Color alpha percent'))}">
                <span aria-hidden="true">%</span>
              </span>
              <input type="text" value="${esc(customValue || '')}" data-nt-chat-appearance-color-text data-nt-chat-appearance-scope="${scope}" data-nt-chat-appearance-key="${definition.key}" ${mode === 'custom' && !dependencyHidden ? '' : 'disabled'} spellcheck="false" placeholder="rgba(124, 108, 255, 1)">
            </span>
          </span>
          ${this.renderResetButton(definition, scope, false)}
        </div>`;
    }

    onModalClick(event) {
        if (event.target.closest('[data-nt-chat-appearance-close]')) return this.close();
        const result = this.handleWorkspaceClick(event.target, 'card');
        if (result?.handled && result.rerender) this.renderModal();
    }

    onModalInput(event) { this.handleControl(event.target, 'card', { live: true }); }
    onModalChange(event) {
        const presetResult = this.handlePresetChange(event.target, 'card');
        if (presetResult?.handled) return;
        const result = this.handleControl(event.target, 'card', { live: false });
        if (result?.rerender) this.renderModal();
    }

    handleGlobalInput(target) { return this.handleControl(target, 'global', { live: true }); }
    handleGlobalChange(target) {
        const presetResult = this.handlePresetChange(target, 'global');
        if (presetResult?.handled) return presetResult;
        return this.handleControl(target, 'global', { live: false });
    }
    handleGlobalClick(target) { return this.handleWorkspaceClick(target, 'global'); }

    resetGlobal() {
        const values = structuredClone(CHAT_APPEARANCE_DEFAULTS);
        this.settings.chatAppearance = values;
        this.autosaveActivePreset('global', null, values);
        saveSettings();
        this.sync();
    }

    handlePresetChange(target, scope) {
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return null;
        if (target.dataset.ntChatAppearanceScope !== scope) return null;
        if (target.matches('[data-nt-chat-appearance-preset-select]')) {
            this.selectPreset(scope, String(target.value || ''));
            return { handled: true, rerender: false };
        }
        if (target.matches('[data-nt-chat-appearance-preset-file]')) {
            const file = target.files?.[0] || null;
            target.value = '';
            void this.importPresetFile(scope, file);
            return { handled: true, rerender: false };
        }
        return null;
    }

    handleWorkspaceClick(target, scope) {
        if (!(target instanceof Element)) return null;
        const controlReset = target.closest('[data-nt-chat-appearance-reset-key]');
        if (controlReset?.dataset.ntChatAppearanceScope === scope) {
            const key = controlReset.dataset.ntChatAppearanceResetKey;
            const definition = definitionMap.get(key);
            const identity = scope === 'card' ? this.modalIdentity : null;
            if (!definition || (scope === 'card' && !identity)) return { handled: true, rerender: false };
            const values = this.valuesForScope(scope, identity);
            values[key] = null;
            this.persistScope(scope, identity, values);
            this.refreshControlRow(controlReset.closest('.nt-pref-setting-row'), definition, scope, identity);
            return { handled: true, rerender: false };
        }
        const resetCategory = target.closest('[data-nt-chat-appearance-reset-category]');
        if (resetCategory?.dataset.ntChatAppearanceScope === scope) {
            const role = resetCategory.dataset.ntChatAppearanceRole;
            const group = resetCategory.dataset.ntChatAppearanceGroup;
            const category = resetCategory.dataset.ntChatAppearanceCategory;
            const identity = scope === 'card' ? this.modalIdentity : null;
            if (scope === 'card' && !identity) return { handled: true, rerender: false };
            const values = this.valuesForScope(scope, identity);
            for (const definition of categoryDefinitions(role, group, category)) values[definition.key] = null;
            this.persistScope(scope, identity, values);
            return { handled: true, rerender: true };
        }
        const copyCategory = target.closest('[data-nt-chat-appearance-copy-category]');
        if (copyCategory?.dataset.ntChatAppearanceScope === scope) {
            const direction = copyCategory.dataset.ntChatAppearanceCopyCategory;
            const group = copyCategory.dataset.ntChatAppearanceGroup;
            const category = copyCategory.dataset.ntChatAppearanceCategory;
            const identity = scope === 'card' ? this.modalIdentity : null;
            if (scope === 'card' && !identity) return { handled: true, rerender: false };
            const values = this.valuesForScope(scope, identity);
            if (direction === 'user-to-character') {
                for (const userDef of categoryDefinitions('user', group, category)) {
                    const suffix = userDef.key.replace(/^user/, '');
                    const charDef = definitionMap.get(`character${suffix}`);
                    if (charDef) values[charDef.key] = SAME_AS_USER;
                }
            } else {
                const effective = this.getEffectiveValues(identity);
                for (const charDef of categoryDefinitions('character', group, category)) {
                    const suffix = charDef.key.replace(/^character/, '');
                    const userDef = definitionMap.get(`user${suffix}`);
                    if (userDef) values[userDef.key] = normalizedValue(userDef, effective[charDef.key]);
                }
            }
            this.persistScope(scope, identity, values);
            return { handled: true, rerender: true };
        }
        const roleButton = target.closest('[data-nt-chat-appearance-role]');
        if (roleButton?.dataset.ntChatAppearanceScope === scope) {
            const role = roleButton.dataset.ntChatAppearanceRole;
            if (roles.some(item => item.id === role)) {
                this.activeRole[scope] = role;
                const group = groups.includes(this.activeGroup[scope]) ? this.activeGroup[scope] : groups[0];
                this.activeCategory[scope] = categoriesFor(role, group)[0] || '';
                return { handled: true, rerender: true };
            }
        }
        const groupButton = target.closest('[data-nt-chat-appearance-group]');
        if (groupButton?.dataset.ntChatAppearanceScope === scope) {
            const group = groupButton.dataset.ntChatAppearanceGroup;
            if (groups.includes(group)) {
                this.activeGroup[scope] = group;
                this.activeCategory[scope] = categoriesFor(this.activeRole[scope] || 'user', group)[0] || '';
                return { handled: true, rerender: true };
            }
        }
        const categoryButton = target.closest('[data-nt-chat-appearance-category]');
        if (categoryButton?.dataset.ntChatAppearanceScope === scope) {
            const category = categoryButton.dataset.ntChatAppearanceCategory;
            const role = this.activeRole[scope] || 'user';
            const group = this.activeGroup[scope] || groups[0];
            if (categoriesFor(role, group).includes(category)) {
                this.activeCategory[scope] = category;
                return { handled: true, rerender: true };
            }
        }
        const resetCard = target.closest('[data-nt-chat-appearance-reset-card]');
        if (scope === 'card' && resetCard) {
            if (!this.modalIdentity) return { handled: true, rerender: false };
            const identity = this.modalIdentity;
            const values = structuredClone(CHAT_APPEARANCE_DEFAULTS);
            delete this.settings.characterChatAppearance?.[identity.key];
            this.autosaveActivePreset('card', identity, values);
            saveSettings();
            this.sync();
            this.modalIdentity = this.getCharacterIdentity();
            return { handled: true, rerender: true };
        }
        const resetGlobal = target.closest('[data-nt-chat-appearance-reset-global]');
        if (scope === 'global' && resetGlobal) {
            this.resetGlobal();
            return { handled: true, rerender: true };
        }
        const addPreset = target.closest('[data-nt-chat-appearance-preset-add]');
        if (addPreset?.dataset.ntChatAppearanceScope === scope) {
            void this.addPreset(scope);
            return { handled: true, rerender: false };
        }
        const renamePreset = target.closest('[data-nt-chat-appearance-preset-rename]');
        if (renamePreset?.dataset.ntChatAppearanceScope === scope) {
            void this.renameActivePreset(scope);
            return { handled: true, rerender: false };
        }
        const importPreset = target.closest('[data-nt-chat-appearance-preset-import]');
        if (importPreset?.dataset.ntChatAppearanceScope === scope) {
            const owner = importPreset.closest('[data-nt-chat-appearance-workspace]');
            owner?.querySelector('[data-nt-chat-appearance-preset-file]')?.click();
            return { handled: true, rerender: false };
        }
        const exportPreset = target.closest('[data-nt-chat-appearance-preset-export]');
        if (exportPreset?.dataset.ntChatAppearanceScope === scope) {
            this.exportActivePreset(scope);
            return { handled: true, rerender: false };
        }
        const deletePreset = target.closest('[data-nt-chat-appearance-preset-delete]');
        if (deletePreset?.dataset.ntChatAppearanceScope === scope) {
            void this.deleteActivePreset(scope);
            return { handled: true, rerender: false };
        }
        return null;
    }

    refreshControlRow(row, definition, scope, identity) {
        if (!row || !definition) return;
        const values = this.valuesForScope(scope, identity);
        const stored = normalizedValue(definition, values?.[definition.key]);
        const effective = this.getEffectiveValues(identity);
        const inherited = normalizedValue(definition, effective?.[definition.key]);
        const scopeLabelValue = 'default';

        const direct = row.querySelector('[data-nt-chat-appearance-control]');
        if (direct) {
            if (definition.type === 'boolean') direct.value = stored === null ? scopeLabelValue : stored === SAME_AS_USER ? SAME_AS_USER : stored ? 'on' : 'off';
            else direct.value = stored === null ? scopeLabelValue : stored;
        }

        const mode = row.querySelector('[data-nt-chat-appearance-mode]');
        if (mode) {
            const custom = stored !== null && stored !== SAME_AS_USER;
            mode.value = stored === null ? 'default' : stored === SAME_AS_USER ? SAME_AS_USER : 'custom';
            const value = custom ? stored : (inherited ?? definition.fallback);
            const number = row.querySelector('[data-nt-chat-appearance-value]');
            const range = row.querySelector('[data-nt-chat-appearance-range]');
            if (number) { number.value = value; number.disabled = !custom; }
            if (range) { range.value = value; range.disabled = !custom; }
            const output = row.querySelector(`[data-nt-chat-appearance-output="${CSS.escape(definition.key)}"]`);
            if (output) output.textContent = stored === SAME_AS_USER ? t('Same as User') : (inherited !== null && inherited !== SAME_AS_USER ? formatNumber(definition, inherited) : t('Theme'));
        }

        const colorMode = row.querySelector('[data-nt-chat-appearance-color-mode]');
        if (colorMode) {
            const modeValue = stored === null ? 'default' : stored === 'accent' ? 'accent' : stored === SAME_AS_USER ? SAME_AS_USER : 'custom';
            colorMode.value = modeValue;
            const active = modeValue === 'custom';
            row.querySelector('.nt-chat-appearance-color-custom')?.classList.toggle('is-active', active);
            row.querySelectorAll('[data-nt-chat-appearance-color-picker], [data-nt-chat-appearance-color-text]').forEach(input => { input.disabled = !active; });
        }
    }

    valuesForScope(scope, identity) {
        return scope === 'card' ? this.getCardValues(identity, true) : this.getGlobalValues();
    }

    persistScope(scope, identity, values) {
        const clean = cleanAppearanceObject(values);
        if (scope === 'card') {
            if (isDefaultAppearance(clean)) delete this.settings.characterChatAppearance?.[identity.key];
            else this.settings.characterChatAppearance[identity.key] = clean;
        } else {
            this.settings.chatAppearance = clean;
        }
        this.autosaveActivePreset(scope, identity, clean);
        saveSettings();
        this.sync();
        if (scope === 'card') this.modalIdentity = this.getCharacterIdentity();
    }

    handleControl(target, expectedScope, { live } = {}) {
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return null;
        const scope = target.dataset.ntChatAppearanceScope;
        if (scope !== expectedScope) return null;
        const key = target.dataset.ntChatAppearanceKey;
        const definition = definitionMap.get(key);
        if (!definition) return null;
        const identity = scope === 'card' ? this.modalIdentity : null;
        if (scope === 'card' && !identity) return null;
        const values = this.valuesForScope(scope, identity);
        let rerender = false;

        if (target.matches('[data-nt-chat-appearance-control]')) {
            if (live) return { handled: true, rerender: false };
            if (target.value === SAME_AS_USER && definition.role === 'character') values[key] = SAME_AS_USER;
            else if (definition.type === 'boolean') values[key] = target.value === 'on' ? true : target.value === 'off' ? false : null;
            else values[key] = target.value === 'default' ? null : normalizedValue(definition, target.value);
            rerender = false;
        } else if (target.matches('[data-nt-chat-appearance-mode]')) {
            if (live) return { handled: true, rerender: false };
            if (target.value === SAME_AS_USER && definition.role === 'character') {
                values[key] = SAME_AS_USER;
            } else if (target.value === 'custom') {
                const inherited = normalizedValue(definition, this.getEffectiveValues(identity)[key]);
                values[key] = inherited ?? definition.fallback;
            } else values[key] = null;
            const row = target.closest('.nt-pref-setting-row');
            const input = row?.querySelector('[data-nt-chat-appearance-value]');
            const range = row?.querySelector('[data-nt-chat-appearance-range]');
            if (input) input.disabled = target.value !== 'custom';
            if (range) range.disabled = target.value !== 'custom';
            rerender = false;
        } else if (target.matches('[data-nt-chat-appearance-value], [data-nt-chat-appearance-range]')) {
            if (target.disabled) return { handled: true, rerender: false };
            const value = numberValue(definition, target.value);
            if (value === null) return { handled: true, rerender: false };
            const row = target.closest('.nt-pref-setting-row');
            const number = row?.querySelector('[data-nt-chat-appearance-value]');
            const range = row?.querySelector('[data-nt-chat-appearance-range]');
            if (number && number !== target) number.value = value;
            if (range && range !== target) range.value = value;
            const output = row?.querySelector(`[data-nt-chat-appearance-output="${CSS.escape(key)}"]`);
            if (output) output.textContent = formatNumber(definition, value);
            if (live) {
                this.previewNumberValue(definition, value);
                return { handled: true, rerender: false };
            }
            values[key] = value;
        } else if (target.matches('[data-nt-chat-appearance-color-mode]')) {
            if (live) return { handled: true, rerender: false };
            if (target.value === 'accent') values[key] = 'accent';
            else if (target.value === SAME_AS_USER && definition.role === 'character') values[key] = SAME_AS_USER;
            else if (target.value === 'custom') {
                const effective = normalizedValue(definition, this.getEffectiveValues(identity)[key]);
                values[key] = rgbaEditorValue(effective && effective !== 'accent' && effective !== SAME_AS_USER ? effective : (this.settings.accent || '#7c6cff'), this.settings.accent || '#7c6cff');
            } else values[key] = null;
            const row = target.closest('.nt-chat-appearance-color-row');
            const custom = row?.querySelector('.nt-chat-appearance-color-custom');
            const active = target.value === 'custom';
            custom?.classList.toggle('is-active', active);
            row?.querySelectorAll('[data-nt-chat-appearance-color-picker], [data-nt-chat-appearance-color-alpha], [data-nt-chat-appearance-color-alpha-value], [data-nt-chat-appearance-color-text]').forEach(input => { input.disabled = !active; });
            rerender = false;
        } else if (target.matches('[data-nt-chat-appearance-color-picker]')) {
            const row = target.closest('.nt-chat-appearance-color-row');
            const text = row?.querySelector('[data-nt-chat-appearance-color-text]');
            const alphaControl = row?.querySelector('[data-nt-chat-appearance-color-alpha]');
            const alpha = Math.max(0, Math.min(1, Number(alphaControl?.value ?? 100) / 100));
            const candidate = rgbaFromPicker(String(target.value || '').trim(), alpha);
            if (text) text.value = candidate;
            if (live) {
                this.previewColorValue(definition, candidate);
                return { handled: true, rerender: false };
            }
            values[key] = candidate;
        } else if (target.matches('[data-nt-chat-appearance-color-alpha], [data-nt-chat-appearance-color-alpha-value]')) {
            if (target.disabled) return { handled: true, rerender: false };
            const row = target.closest('.nt-chat-appearance-color-row');
            const alpha = Math.max(0, Math.min(100, Math.round(Number(target.value) || 0)));
            const alphaRange = row?.querySelector('[data-nt-chat-appearance-color-alpha]');
            const alphaNumber = row?.querySelector('[data-nt-chat-appearance-color-alpha-value]');
            if (alphaRange && alphaRange !== target) alphaRange.value = String(alpha);
            if (alphaNumber && alphaNumber !== target) alphaNumber.value = String(alpha);
            const picker = row?.querySelector('[data-nt-chat-appearance-color-picker]');
            const text = row?.querySelector('[data-nt-chat-appearance-color-text]');
            const candidate = rgbaFromPicker(String(picker?.value || colorPickerValue(text?.value, this.settings.accent)).trim(), alpha / 100);
            if (text) text.value = candidate;
            if (live) {
                this.previewColorValue(definition, candidate);
                return { handled: true, rerender: false };
            }
            values[key] = candidate;
        } else if (target.matches('[data-nt-chat-appearance-color-text]')) {
            const candidate = String(target.value || '').trim();
            const valid = cssColorValue(candidate);
            target.classList.toggle('is-invalid', !valid);
            if (!valid) {
                if (!live) {
                    this.toast?.(t('Enter a valid CSS color.'));
                    rerender = true;
                }
                return { handled: true, rerender };
            }
            const row = target.closest('.nt-chat-appearance-color-row');
            const picker = row?.querySelector('[data-nt-chat-appearance-color-picker]');
            const alphaRange = row?.querySelector('[data-nt-chat-appearance-color-alpha]');
            const alphaNumber = row?.querySelector('[data-nt-chat-appearance-color-alpha-value]');
            if (picker) picker.value = colorPickerValue(candidate, this.settings.accent);
            const alphaPercent = alphaPercentValue(candidate);
            if (alphaRange) alphaRange.value = alphaPercent;
            if (alphaNumber) alphaNumber.value = alphaPercent;
            if (live) {
                this.previewColorValue(definition, valid);
                return { handled: true, rerender: false };
            }
            values[key] = valid;
        } else return null;

        this.persistScope(scope, identity, values);
        return { handled: true, rerender };
    }
}
