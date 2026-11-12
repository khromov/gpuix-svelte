/** The playground's editor: CodeMirror 6 with Svelte's grammar, coloured by the docs site's own tokens. */

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { svelte } from '@replit/codemirror-lang-svelte';

const theme = EditorView.theme(
	{
		'&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--fg)', fontSize: '13.5px' },
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65' },
		'.cm-content': { padding: '14px 0', caretColor: 'var(--fg)' },
		'.cm-line': { padding: '0 16px 0 8px' },
		'.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--faint)', border: 'none' },
		'.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px' },
		'.cm-activeLine': { backgroundColor: '#ffffff08' },
		'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg)' },
		'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
		'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#ff3e0047' },
		'.cm-selectionMatch': { backgroundColor: '#ffffff14' },
		'&.cm-focused .cm-matchingBracket': { backgroundColor: '#ffffff1f', outline: 'none' },
		'.cm-foldPlaceholder': { backgroundColor: 'var(--chip)', border: 'none', color: 'var(--muted)' },
		'.cm-tooltip': { backgroundColor: 'var(--chip)', border: '1px solid var(--line-strong)', color: 'var(--fg)' },
		'.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--line-strong)', color: 'var(--fg)' },
		'.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--fg)' },
		'.cm-problem-line': { backgroundColor: '#ff616626', boxShadow: 'inset 2px 0 0 var(--caution)' }
	},
	{ dark: true }
);

const colours = HighlightStyle.define([
	{ tag: [t.comment, t.meta], color: 'var(--t-comment)' },
	{ tag: [t.punctuation, t.operator, t.bracket, t.angleBracket], color: 'var(--t-punct)' },
	{ tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.atom], color: 'var(--t-keyword)' },
	{ tag: [t.string, t.special(t.string), t.regexp, t.attributeValue], color: 'var(--t-string)' },
	{ tag: [t.function(t.variableName), t.function(t.propertyName), t.className], color: 'var(--t-fn)' },
	{ tag: [t.tagName, t.typeName], color: 'var(--t-tag)' },
	{ tag: [t.attributeName, t.propertyName], color: 'var(--t-attr)' },
	{ tag: [t.number, t.bool, t.null, t.unit, t.color], color: 'var(--t-num)' }
]);

const set_problem = StateEffect.define<number | null>();

const problem_line = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(marks, transaction) {
		marks = marks.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (!effect.is(set_problem)) continue;
			const line = effect.value;
			marks = line === null || line < 1 || line > transaction.state.doc.lines ? Decoration.none : Decoration.set([Decoration.line({ class: 'cm-problem-line' }).range(transaction.state.doc.line(line).from)]);
		}
		return marks;
	},
	provide: (field) => EditorView.decorations.from(field)
});

export interface Editor {
	get(): string;
	set(text: string): void;
	/** Marks the 1-based line a compile error points at; `null` clears it. */
	mark(line: number | null): void;
}

export function create_editor(parent: HTMLElement, doc: string, on_change: (text: string) => void): Editor {
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc,
			extensions: [
				basicSetup,
				keymap.of([indentWithTab]),
				indentUnit.of('\t'),
				EditorState.tabSize.of(2),
				svelte(),
				theme,
				syntaxHighlighting(colours),
				problem_line,
				EditorView.contentAttributes.of({ 'aria-label': 'Component source. Press Escape, then Tab, to leave the editor.' }),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) on_change(update.state.doc.toString());
				})
			]
		})
	});

	return {
		get: () => view.state.doc.toString(),
		set: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, effects: set_problem.of(null) }),
		mark: (line) => view.dispatch({ effects: set_problem.of(line) })
	};
}
