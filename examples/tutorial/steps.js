/**
 * Content only. `prose` and `code[].file` are paths Tutorial.svelte reads at
 * mount time; keeping the reads out of this plain-JS module is what lets a
 * saved sample reload (see the comment there).
 */

export const CHAPTERS = ['Foundations', 'Building blocks', 'The GPUI side', 'Workflow'];

const CONDITIONS = '--conditions custom-renderer --conditions development';

export const STEPS = [
	{
		id: 'what-is',
		chapter: 0,
		title: 'What is gpuix-svelte?',
		prose: 'content/what-is.md',
		diagram: {
			kind: 'pipeline',
			title: 'From a .svelte file to pixels',
			nodes: [
				{ label: 'App.svelte', caption: 'your component' },
				{ label: 'svelte/compiler', caption: 'customRenderer option' },
				{ label: 'renderer.js', caption: 'JS shadow tree' },
				{ label: '@gpuix/native', caption: 'one applyBatch per frame' },
				{ label: 'GPUI window', caption: 'Metal / DirectX / Vulkan', color: '#a6e3a1' }
			]
		},
		code: [{ label: 'examples/tutorial/main.js — what opened this window', language: 'javascript', file: 'main.js' }],
		live: null,
		quiz: {
			question: 'Where does a gpuix-svelte component end up?',
			options: [
				'In a hidden browser window (a webview)',
				'In a native GPUI window, laid out and painted on the GPU',
				'In the terminal, as text'
			],
			answer: 1,
			explanation:
				'There is no DOM or webview anywhere in the process: Svelte drives a shadow tree that @gpuix/native turns into GPUI elements.'
		}
	},
	{
		id: 'setup',
		chapter: 0,
		title: 'Setup and running',
		prose: 'content/setup.md',
		diagram: {
			kind: 'pipeline',
			title: 'How a .svelte import becomes a module',
			nodes: [
				{ label: '--import gpuix-svelte/register', caption: 'before the entry resolves' },
				{ label: 'module.registerHooks', caption: 'intercepts *.svelte' },
				{ label: 'compile_svelte()', caption: 'svelte/compiler, customRenderer' },
				{ label: 'ES module', caption: 'imports gpuix-svelte/renderer' },
				{ label: 'render_hot()', caption: 'opens the window', color: '#a6e3a1' }
			]
		},
		code: [
			{
				label: 'terminal',
				language: 'bash',
				source: [
					'npm install github:khromov/gpuix-svelte',
					'npm install -D svelte@https://pkg.svelte.dev/svelte/pr/18511',
					'',
					'npx gpuix-svelte app.js          # Node',
					'npx gpuix-svelte --bun app.js    # Bun',
					'',
					'# which is short for (both --conditions flags and the loader are required)',
					`node ${CONDITIONS} \\`,
					'     --import gpuix-svelte/register app.js',
					`bun ${CONDITIONS} \\`,
					'     --preload gpuix-svelte/plugin app.js'
				].join('\n')
			},
			{ label: 'bunfig.toml', language: 'toml', source: 'preload = ["gpuix-svelte/plugin"]' },
			{
				label: 'package.json',
				language: 'json',
				source: JSON.stringify(
					{
						scripts: {
							start: 'gpuix-svelte app.js',
							'bun:start': 'gpuix-svelte --bun app.js'
						}
					},
					null,
					2
				)
			}
		],
		live: null,
		quiz: {
			question: 'You run `node app.js` without the two --conditions flags. What happens?',
			options: [
				'Nothing changes; the flags only make startup faster',
				'svelte resolves to its server build, mount() is missing and the app fails before a window opens',
				'The window opens, but styles are ignored'
			],
			answer: 1,
			explanation:
				'The custom-renderer build of Svelte is selected through package conditions; without them the exports map picks the server build.'
		}
	},
	{
		id: 'first-component',
		chapter: 0,
		title: 'Your first component',
		prose: 'content/first-component.md',
		diagram: {
			kind: 'compare',
			title: 'What you wrote, what GPUI got',
			left: {
				title: 'Hello.svelte',
				tree: {
					label: '<div style="…">',
					children: [
						{ label: '<div>', children: [{ label: 'Hello, GPUI!' }] },
						{ label: '<div>', children: [{ label: 'Rendered by GPUI…' }] }
					]
				}
			},
			right: {
				title: "GPUI's tree",
				color: '#a6e3a1',
				tree: {
					label: 'div #12',
					note: 'setStyle {…}',
					children: [
						{ label: 'div #13', children: [{ label: 'text #14', note: '"Hello, GPUI!"' }] },
						{ label: 'div #15', children: [{ label: 'text #16', note: '"Rendered by GPUI…"' }] }
					]
				}
			},
			legend: 'One createElement per element and per non-blank text run; ids are handed out by the renderer.'
		},
		code: [{ label: 'samples/Hello.svelte', language: 'html', file: 'samples/Hello.svelte' }],
		live: 'hello',
		quiz: {
			question: 'You write <button onclick={save}>Save</button>. What does GPUI receive?',
			options: [
				'A native push button',
				'A div carrying the click listener, plus a one-time warning that button is not a GPUI tag',
				'Nothing — unknown tags are dropped from the tree'
			],
			answer: 1,
			explanation:
				'Only GPUI tags exist. Anything else degrades to a div (styles and listeners intact) and the renderer warns once per tag name.'
		}
	},
	{
		id: 'state-events',
		chapter: 1,
		title: 'State and events',
		prose: 'content/state-events.md',
		diagram: {
			kind: 'pipeline',
			direction: 'column',
			title: 'One click, one frame',
			nodes: [
				{ label: 'GPUI hit-tests the click', caption: 'occlusion included' },
				{ label: 'native callback', caption: '{ elementId, eventType, x, y, … }' },
				{ label: 'dispatch(event)', caption: 'handlers on that element only — no bubbling' },
				{ label: 'count++', caption: 'your handler' },
				{ label: 'flushSync()', caption: "Svelte's effects run now, not on a microtask" },
				{ label: 'commit()', caption: 'every queued mutation in one applyBatch', color: '#a6e3a1' }
			]
		},
		code: [{ label: 'samples/Counter.svelte', language: 'html', file: 'samples/Counter.svelte' }],
		live: 'counter',
		quiz: {
			question: 'A fetch() resolves and updates $state while nobody is clicking. When does the window change?',
			options: [
				'Only after the next mouse event reaches the window',
				'On the next frame: the ~125 fps loop commits whenever the renderer is dirty',
				'Never — state changed outside an event handler is ignored'
			],
			answer: 1,
			explanation:
				'render.js runs a paced setTimeout loop around native.tick(); each iteration calls commit() if anything was queued. Where there is no loop the renderer drains on a microtask instead.'
		}
	},
	{
		id: 'styling',
		chapter: 1,
		title: 'Styling: what reaches GPUI',
		prose: 'content/styling.md',
		diagram: {
			kind: 'pipeline',
			title: 'style="padding: 8px 16px; flex: 1; font-size: 1rem"',
			nodes: [
				{ label: 'parse_css_text', caption: 'camelCase keys, 8px → 8' },
				{ label: 'expand shorthands', caption: 'paddingTop/Right/Bottom/Left' },
				{ label: 'type gate', caption: 'fontSize: 1rem → warned, dropped', color: '#f38ba8' },
				{ label: 'setStyle {…}', caption: 'flex: 1 → serde ignores the key' },
				{ label: 'GPUI Style', caption: 'what actually paints', color: '#a6e3a1' }
			]
		},
		code: [{ label: 'samples/Styled.svelte', language: 'html', file: 'samples/Styled.svelte' }],
		live: 'styled',
		quiz: {
			question: 'Which of these reaches GPUI as written?',
			options: ['margin: 0 auto', 'padding: 8px 16px', 'border: 1px solid #fff', 'font-size: 1rem'],
			answer: 1,
			explanation:
				'Box shorthands expand to the four longhands. auto is only valid on width/height/min-*/max-*, border has no field to land in, and rem is not a pixel.'
		}
	},
	{
		id: 'layout',
		chapter: 1,
		title: 'Layout and scrolling',
		prose: 'content/layout.md',
		diagram: {
			kind: 'compare',
			title: 'Where a scroller may live',
			left: {
				title: 'Supported',
				color: '#a6e3a1',
				tree: {
					label: 'div  height: 100%',
					children: [
						{ label: 'div  header' },
						{
							label: 'div  flex-grow: 1; overflow-y: scroll',
							children: [{ label: 'row × 40' }]
						}
					]
				}
			},
			right: {
				title: 'Not supported',
				color: '#f38ba8',
				tree: {
					label: 'div  overflow-y: scroll',
					children: [
						{
							label: 'div  overflow-y: scroll',
							virtual: true,
							note: 'a scroller inside a scroller',
							children: [{ label: 'row × 40', virtual: true }]
						}
					]
				}
			},
			legend: 'Siblings may both scroll (this window has two); horizontal scrollers such as <code> may sit inside a vertical one.'
		},
		code: [{ label: 'samples/Scroll.svelte', language: 'html', file: 'samples/Scroll.svelte' }],
		live: 'scroll',
		previewFill: true,
		quiz: {
			question: 'A div has overflow-y: scroll but never scrolls. The most likely cause?',
			options: [
				'It has no bounded height, so it grows to fit its content instead of clipping it',
				'Scrolling needs overflow: auto rather than scroll',
				'GPUI only scrolls <virtual-list>'
			],
			answer: 0,
			explanation:
				'A scroller needs a definite height from its parent: flex-grow: 1 (plus min-height: 0) in a column that has a height, or height: 100%.'
		}
	},
	{
		id: 'lists',
		chapter: 1,
		title: 'Lists, conditionals and the shadow tree',
		prose: 'content/lists.md',
		diagram: {
			kind: 'compare',
			title: 'The same {#each} in both trees',
			left: {
				title: "Svelte's tree (shadow)",
				tree: {
					label: 'div',
					children: [
						{ label: '<!-- {#if} anchor -->', virtual: true },
						{ label: 'div', children: [{ label: '"alpha"' }] },
						{ label: '"\\n    "', virtual: true, note: 'blank text' },
						{ label: 'div', children: [{ label: '"beta"' }] },
						{ label: '<!-- {#each} anchor -->', virtual: true }
					]
				}
			},
			right: {
				title: "GPUI's tree",
				color: '#a6e3a1',
				tree: {
					label: 'div #20',
					children: [
						{ label: 'div #21', children: [{ label: 'text #22' }] },
						{ label: 'div #23', children: [{ label: 'text #24' }] }
					]
				}
			},
			legend: 'Grey nodes exist only in JavaScript: they keep order for Svelte but never take a slot in a flex row or a gap.'
		},
		code: [{ label: 'samples/List.svelte', language: 'html', file: 'samples/List.svelte' }],
		live: 'list',
		quiz: {
			question: 'Which of these gets a native GPUI id?',
			options: [
				"The comment anchor an {#if} block leaves behind",
				'A text node holding only a newline and indentation',
				'A div that is currently reachable from the root',
				'A component that was rendered but never inserted'
			],
			answer: 2,
			explanation:
				'Ids are allocated lazily when a node first becomes live. Comments, fragments and blank text stay virtual, and an offscreen render never touches GPUI at all.'
		}
	},
	{
		id: 'hit-testing',
		chapter: 2,
		title: 'Hit testing and the pointer',
		prose: 'content/hit-testing.md',
		diagram: {
			kind: 'compare',
			title: 'Why the badge steals the click',
			left: {
				title: 'Broken',
				color: '#f38ba8',
				tree: {
					label: 'div  onclick  background-color',
					children: [
						{ label: '"Save"' },
						{ label: 'div  badge  background-color', note: 'painted → takes the hit; nothing bubbles' }
					]
				}
			},
			right: {
				title: 'Fixed',
				color: '#a6e3a1',
				tree: {
					label: 'div  onclick  background-color',
					children: [
						{ label: '"Save"' },
						{ label: 'div  badge  pointer-events: none', note: 'the click falls through to the button' }
					]
				}
			}
		},
		code: [{ label: 'samples/HitTest.svelte', language: 'html', file: 'samples/HitTest.svelte' }],
		live: 'hittest',
		quiz: {
			question: 'A div with onclick contains a coloured label div. Clicking the label does nothing. Why?',
			options: [
				'Click events are only delivered to text nodes',
				'The painted label wins the hit test, and events never bubble up to the parent',
				'onclick has to be spelled onClick'
			],
			answer: 1,
			explanation:
				'An element that paints a background, a border, or is positioned blocks hits behind it. Give decorative children pointer-events: none.'
		}
	},
	{
		id: 'native-elements',
		chapter: 2,
		title: 'Native elements',
		prose: 'content/native-elements.md',
		diagram: {
			kind: 'pipeline',
			title: '<textarea value={notes} minRows={3} onchange={…}>',
			nodes: [
				{ label: 'setAttribute("minRows", 3)', caption: "Svelte's renderer contract" },
				{ label: '["setCustomProp", id, "minRows", 3]', caption: 'name, case and value untouched' },
				{ label: 'native editor', caption: 'caret, selection, IME, undo', color: '#a6e3a1' },
				{ label: 'change event', caption: 'event.value is the new text' },
				{ label: 'notes = e.value', caption: 'your handler' }
			]
		},
		code: [
			{ label: 'samples/Native.svelte', language: 'html', file: 'samples/Native.svelte' },
			{ label: 'CodePanel.svelte — how this tutorial shows code', language: 'html', file: 'CodePanel.svelte' }
		],
		live: 'native',
		quiz: {
			question: 'How do you keep an <input> and a $state in sync?',
			options: [
				'bind:value={text}',
				'value={text} together with onchange={(e) => (text = e.value)}',
				'oninput={(e) => (text = e.target.value)}'
			],
			answer: 1,
			explanation:
				'bind: is refused by the compiler under a custom renderer, and the change payload carries the text in event.value — there is no DOM target to read.'
		}
	},
	{
		id: 'motion',
		chapter: 2,
		title: 'Animation with motion',
		prose: 'content/motion.md',
		diagram: {
			kind: 'pipeline',
			title: 'A toggle flips',
			nodes: [
				{ label: 'on = !on', caption: '$state' },
				{ label: 'animate: { left: on ? 25 : 3 }', caption: 'a new target' },
				{ label: 'setCustomProp motion', caption: 'one mutation' },
				{ label: 'GPUI tweens per frame', caption: '0.25 s, easeOut — no JavaScript involved', color: '#a6e3a1' }
			]
		},
		code: [{ label: 'samples/Motion.svelte', language: 'html', file: 'samples/Motion.svelte' }],
		live: 'motion',
		quiz: {
			question: 'transition: { duration: 200 } — what happens?',
			options: ['A 200 ms animation', 'A 200 second animation, because durations are in seconds', 'A compile error'],
			answer: 1,
			explanation: 'motion follows Framer Motion conventions: duration and delay are seconds, so 0.2 is what you meant.'
		}
	},
	{
		id: 'hot-reload',
		chapter: 3,
		title: 'Hot reload and the dev loop',
		prose: 'content/hot-reload.md',
		diagram: {
			kind: 'pipeline',
			title: 'What a save does',
			nodes: [
				{ label: 'save Hello.svelte', caption: 'content must change; touch does nothing' },
				{ label: 'fs.watch', caption: "the entry's directory, 60 ms debounce" },
				{ label: 'import(entry?v=N)', caption: 'child .svelte imports busted too' },
				{ label: 'unmount(old)', caption: 'the old subtree is destroyed at commit' },
				{ label: 'mount(new)', caption: 'same window, same native handle', color: '#a6e3a1' }
			]
		},
		code: [
			{
				label: 'src/render.js — render_hot, condensed',
				language: 'javascript',
				source: [
					'export async function render_hot(entry, options = {}) {',
					'\tconst url = entry instanceof URL ? entry : pathToFileURL(entry);',
					'\tlet version = 0;',
					'\tconst load = async () => (await import(`${url.href}?v=${++version}`)).default;',
					'',
					'\trender(await load(), options);',
					'',
					'\tlet timer = null;',
					'\twatch(dirname(fileURLToPath(url)), { recursive: true }, (_event, file) => {',
					"\t\tif (!file?.endsWith('.svelte')) return;",
					'\t\tclearTimeout(timer);',
					'\t\ttimer = setTimeout(async () => render(await load(), options), 60);',
					'\t});',
					'}'
				].join('\n')
			},
			{ label: 'samples/Hello.svelte — edit me and save', language: 'html', file: 'samples/Hello.svelte' }
		],
		live: 'hello',
		quiz: {
			question: 'You edit steps.js while the tutorial is running. What happens?',
			options: [
				'The window reloads with the new content',
				'Nothing: only .svelte writes trigger a reload, and plain JS modules stay cached until a restart',
				'The window closes'
			],
			answer: 1,
			explanation:
				'The watcher filters on the .svelte extension and the ?v=N cache-buster is only spliced into .svelte specifiers, so JS modules keep their first evaluation.'
		}
	},
	{
		id: 'testing',
		chapter: 3,
		title: 'Testing headlessly, and where to go next',
		prose: 'content/testing.md',
		diagram: {
			kind: 'pipeline',
			title: 'The headless loop',
			nodes: [
				{ label: 'mount()', caption: 'renderer, target, anchor' },
				{ label: 'flushSync()', caption: 'effects run' },
				{ label: 'commit()', caption: 'applyBatch' },
				{ label: 'native.flush()', caption: 'layout + paint, no window' },
				{ label: 'simulateClick(x, y)', caption: 'real hit testing' },
				{ label: 'drainEvents() → dispatch()', caption: 'then back to flushSync', color: '#a6e3a1' }
			]
		},
		code: [
			{
				label: 'test/counter.js — a complete headless test',
				language: 'javascript',
				source: [
					"import { mount_headless, click_test_id, all_text, check, finish } from 'gpuix-svelte/test';",
					"import Counter from '../examples/tutorial/samples/Counter.svelte';",
					'',
					'// set_native(new TestGpuixRenderer(400, 300)), create_root(), a comment',
					'// anchor, mount(), and a first settle() — flushSync → commit → native.flush',
					'mount_headless(Counter, { width: 400, height: 300 });',
					'',
					"// GPUI's own hit testing: getElementBounds → simulateClick → drainEvents → dispatch → settle",
					"click_test_id('plus');",
					'',
					"check('the click reached the counter', all_text().join('\\n').includes('doubled: 2'));",
					'',
					'// prints the verdict and exits 1 on any failed check',
					"finish('counter');"
				].join('\n')
			}
		],
		live: 'counter',
		quiz: {
			question: 'Why prefer simulateClick() over calling dispatch() directly in a test?',
			options: [
				'dispatch() is asynchronous',
				'simulateClick() runs GPUI’s real hit testing, so an occluded button fails the test the way it fails a user',
				'dispatch() cannot target elements by id'
			],
			answer: 1,
			explanation:
				'dispatch() injects an event at an element and skips hit testing entirely, so it can pass while the real window does nothing.'
		}
	}
];
