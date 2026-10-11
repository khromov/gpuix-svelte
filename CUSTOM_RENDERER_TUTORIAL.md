# Svelte's custom renderer API, gently

Svelte compiles a component into small imperative steps: create this element, put that text
inside it, insert the result before an anchor, and when state changes, update one text node.
Normally those steps are DOM calls. The **custom renderer API** lets you swap the DOM out: the
compiler emits the same steps, but every one of them is a call on an object *you* provide. Your
object can build a terminal UI, a canvas scene, a native window, a PDF, a test double, anything
with a tree of nodes.

This document walks through that API from nothing to a working renderer, against a made-up,
deliberately tiny target called **Slate**. Slate has the shape of GPUI as `@gpuix/native` exposes
it (flat, id-based, batched mutations), because that shape is what makes the interesting parts of
the API interesting, and that sentence is all the GPUI the rest of the document assumes. The last
section maps everything onto where `gpuix-svelte` does it for real.

The API lives in an unreleased Svelte pull request,
[sveltejs/svelte#18511](https://github.com/sveltejs/svelte/pull/18511). Everything below was
checked against the build vendored in this repository, and every trace and printout is the real
output of the code shown.

1. [The mental model](#1-the-mental-model)
2. [Slate, our pretend toolkit](#2-slate-our-pretend-toolkit)
3. [Watching Svelte talk to a renderer](#3-watching-svelte-talk-to-a-renderer)
4. [The contract, method by method](#4-the-contract-method-by-method)
5. [Your node type: a shadow tree](#5-your-node-type-a-shadow-tree)
6. [Projecting the shadow tree onto Slate](#6-projecting-the-shadow-tree-onto-slate)
7. [Mounting, committing, and events](#7-mounting-committing-and-events)
8. [Getting components compiled for your renderer](#8-getting-components-compiled-for-your-renderer)
9. [What the compiler refuses, and what changes](#9-what-the-compiler-refuses-and-what-changes)
10. [Testing without a screen](#10-testing-without-a-screen)
11. [Where gpuix-svelte goes further](#11-where-gpuix-svelte-goes-further)
12. [Appendix: the rest of the toy](#12-appendix-the-rest-of-the-toy)

---

## 1. The mental model

Three things happen, in three places.

**At compile time**, you pass `experimental: { customRenderer: '<module specifier>' }` to
`svelte/compiler`'s `compile()`. The compiled component gains one import,
`import $renderer from '<specifier>'`, and its body is wrapped in
`var $$pop_renderer = $.push_renderer($renderer); ... $$pop_renderer();`. `push_renderer` sets a
module-level `current_renderer` inside Svelte's runtime for the duration of the component's
setup. The rest of the output is renderer-agnostic: the same `$.from_tree`, `$.child`,
`$.set_text`, `$.event`, `$.append` you would see for the DOM.

**At run time**, every one of those runtime helpers checks `current_renderer` first. Where
`create_element` would call `document.createElement(tag)`, it calls
`current_renderer.createElement(tag)`; where `insert_before` would call `ref.before(node)`, it
calls `current_renderer.insert(parent, node, ref)`. Blocks such as `{#if}` and `{#each}` remember
which renderer was active when they were created and push it back before they touch the tree, so
an effect that runs later (a click, a timer) still reaches your object.

**In your module**, you export `createRenderer({...})` from `svelte/renderer` as the default
export. `createRenderer` returns its argument unchanged; it exists to type-check the object
against the contract. That contract is about twenty methods, and this is the key fact about all
of them:

> Svelte never looks inside your nodes. It creates them through you, hands them back to you, and
> asks you questions about them (`getFirstChild`, `getNextSibling`, `nodeType`...). Your node can
> be any object at all.

So a custom renderer is two jobs: keep a tree that answers Svelte's questions exactly the way a
DOM would (section 5), and project that tree onto whatever you actually draw with (section 6).

## 2. Slate, our pretend toolkit

Slate is about a hundred lines of `Map` bookkeeping (appendix). It keeps the *shape* of a real
toolkit and boils off everything else, so a few minutes with it now will save confusion later.
Its whole API is this:

```ts
export type Op =
	| ['create', number, string]                 // id, tag ('#text' for a text node)
	| ['setText', number, string]
	| ['setAttr', number, string, string | null] // null removes
	| ['insert', number, number, number | null]  // parent, id, before (null = append); reparents if already placed
	| ['remove', number]                         // destroys the subtree
	| ['listen', number, string, boolean]
	| ['setRoot', number];

class Slate {
	constructor(onEvent: (event: { id: number; type: string }) => void);
	apply(ops: Op[]): void;      // one batch of changes
	click(id: number): void;     // pretend the user clicked
	print(): string;             // the tree, for us to look at
}
```

### The operations

Every change to Slate is a tuple. The first element names the operation and the numbers are node
ids; `apply()` takes a list of them and runs them in order.

- `['create', id, tag]` makes a node and files it under `id`, which the **caller** picks. `tag` is
  any string for an element (`'box'`), or `'#text'` for a text node. A created node starts out
  unplaced; `insert` gives it a parent.
- `['setText', id, text]` sets a text node's content.
- `['setAttr', id, key, value]` sets a string attribute; `null` removes it. Slate only stores
  attributes; a real toolkit would read `class` or `style` here.
- `['insert', parent, id, before]` places `id` under `parent`, immediately before the child
  `before`, or at the end when `before` is `null`. If `id` is already placed somewhere it is
  **moved**: taken out of its old spot first. `before` has to be a current child of `parent`, or
  Slate throws.
- `['remove', id]` takes `id` out of its parent and destroys it together with everything under
  it. Those ids are gone; using one again is an error.
- `['listen', id, type, on]` turns event reporting for `type` on or off for that node. Slate
  stores one flag per event type, so whether anyone cares about a click is all it knows; the
  handlers stay with whoever sent the op.
- `['setRoot', id]` names the node the tree starts from, which is also where `print()` starts.

The three methods: `apply(ops)` runs one batch. `click(id)` stands in for the user: if the node is
listening for `click`, Slate calls the `onEvent` callback from the constructor with
`{ id, type: 'click' }`; otherwise the click is dropped. `print()` returns an indented listing,
`<tag#id attrs on:events>` for elements and `#id "text"` for text nodes.

### A batch by hand

Before Svelte enters the picture, here is a tree built directly:

```ts
const slate = new Slate((event) => console.log('event:', JSON.stringify(event)));

slate.apply([
	['create', 1, 'box'],
	['setRoot', 1],
	['create', 2, 'box'],
	['setAttr', 2, 'class', 'card'],
	['insert', 1, 2, null],
	['create', 3, '#text'],
	['setText', 3, 'hello'],
	['insert', 2, 3, null],
	['create', 4, 'box'],
	['setAttr', 4, 'class', 'button'],
	['listen', 4, 'click', true],
	['insert', 1, 4, null]
]);
```

```
<box#1>
  <box#2 class="card">
    #3 "hello"
  <box#4 class="button" on:click>
(4 nodes, 1 batch)
```

One more op moves the button above the card. It already had a parent, so this is a move, and it
is the only op a reorder ever needs:

```ts
slate.apply([['insert', 1, 4, 2]]);   // put 4 under 1, before 2
```

```
<box#1>
  <box#4 class="button" on:click>
  <box#2 class="card">
    #3 "hello"
```

`slate.click(4)` prints `event: {"id":4,"type":"click"}`; `slate.click(2)` prints nothing, because
only the button is listening. And a removal:

```ts
slate.apply([['remove', 2]]);
```

```
<box#1>
  <box#4 class="button" on:click>
(2 nodes)
```

Nodes 2 and 3 are gone. A later `['insert', 1, 2, null]` throws `Slate has no node 2`.

### Four properties that matter

Each of these is shared by most real toolkits, and each shapes the renderer in sections 5 and 6.

- **Nodes are numbers.** In a DOM, `document.createElement('div')` returns an object you keep and
  hand back later. Slate leaves you with only the number you chose: you decided that `4` is the
  button, and from then on remembering that is your job. The renderer keeps that memory in a
  `by_id` map, and since it chooses the ids, it can also choose *when* to allocate one (6.2).
- **Only elements and text exist.** `create` takes an element tag or `'#text'`, and that is the
  whole repertoire. Svelte's `{#if}` needs a comment to anchor to, and its templates come with
  whitespace text nodes that in Slate would be nodes like any other, each taking a slot in the
  layout. Sections 5 and 6 handle both.
- **Changes ship in batches.** The twelve ops above were one `apply()`. A batch is applied whole,
  and the tree is drawn from between batches, where it is consistent. A real toolkit charges per
  crossing (an FFI call, a message to a UI thread), so the intent is one batch per frame.
- **Removing destroys.** After `['remove', 2]`, putting the card back means creating it again
  under a new id. In a DOM, `node.remove()` leaves the object alive and re-appendable, and
  Svelte's runtime relies on that (6.4).

Slate elements can have any tag; the components below use `<box>`.

## 3. Watching Svelte talk to a renderer

Before designing anything, watch the calls. This is `Tiny.svelte`:

```svelte
<script>
	let count = $state(0);
</script>

<box class="card" onclick={() => count++}>
	{count} clicks
	{#if count % 2 === 1}
		<box class="note">odd</box>
	{/if}
</box>
```

and this is what the compiler makes of it under `customRenderer`:

```js
import $renderer from './renderer.ts';
import 'svelte/internal/flags/custom-renderer';
import 'svelte/internal/disclose-version';
import * as $ from 'svelte/internal/client';

var root = $.from_tree([['box', { class: 'note' }, 'odd']]);
var root_1 = $.from_tree([['box', { class: 'card' }, ' ',,]]);

export default function Tiny($$anchor) {
	var $$pop_renderer = $.push_renderer($renderer);
	let count = $.state(0);
	var box = root_1();
	var text = $.child(box);
	var node = $.sibling(text);

	{
		var consequent = ($$anchor) => {
			var box_1 = root();
			$.append($$anchor, box_1);
		};

		$.if(node, ($$render) => {
			if ($.get(count) % 2 === 1) $$render(consequent);
		});
	}

	$.reset(box);
	$.template_effect(() => $.set_text(text, `${$.get(count) ?? ''} clicks `));
	$.event('click', box, () => $.update(count));
	$.append($$anchor, box);
	$$pop_renderer();
}
```

Templates are described as *trees* (`from_tree`) rather than HTML strings, since parsing a
string would take an `innerHTML`. The card's template is `['box', {class}, ' ', <hole>]`: the `' '`
is a text node that `{count} clicks` will be written into, and the hole (the `,,`) becomes a
**comment** that the `{#if}` uses as its anchor.

Now wrap a renderer in a `Proxy` whose `get` trap logs every call, mount the component, and read
the log. `#n` numbers are creation order, so you can follow one node around.

### Mounting

```
createComment("") → comment#1("")                 our own anchor, see section 7
insert(box#2, comment#1(""), null)

createFragment() → fragment#3                     root_1() builds the card template...
createElement("box") → box#4
setAttribute(box#4, "class", "card")
createFragment() → fragment#5
createTextNode(" ") → text#6(" ")                  ...its whitespace text node...
insert(fragment#5, text#6(" "), null)
createComment("") → comment#7("")                  ...and the {#if} anchor
insert(fragment#5, comment#7(""), null)
insert(box#4, fragment#5, null)                    children go in as a fragment
insert(fragment#3, box#4, null)

getFirstChild(fragment#3) → box#4                  Svelte walks what it just built
getFirstChild(box#4) → text#6(" ")                 ($.child)
getNextSibling(text#6(" ")) → comment#7("")        ($.sibling)

getNodeValue(text#6(" ")) → " "                    set_text reads the old value once...
setText(text#6(" "), "0 clicks ")                  ...then writes the new one
addEventListener(box#4, "click", handler, {…})

getParent(comment#1("")) → box#2                   $.append: insert before the anchor
insert(box#2, box#4, comment#1(""))
```

The whole thing then ships to Slate as one batch, and Slate holds:

```
<box#1>
  <box#2 class="card" on:click>
    #3 "0 clicks "
```

Three lessons from the mount alone:

1. **Everything is built offscreen and inserted at the end.** The card, its text and its anchor
   exist for many calls before the final `insert` puts them anywhere reachable. Your
   `createElement` may be making a node that is never shown, and your `insert` has to work for a
   parent that is still offscreen (a fragment).
2. **Whitespace and comments are load-bearing.** `text#6(" ")` is a real node Svelte will write
   into; `comment#7` is where the `{#if}` branch will land. You must keep both in your tree and
   answer traversal questions about them, even though Slate knows only elements and text.
3. **Svelte trusts your traversal answers completely.** `$.child` and `$.sibling` are how the
   compiled code finds the nodes it will later update. If `getNextSibling` skipped the comment,
   `node` would be `null` and the `{#if}` would throw.

### A click that shows the `{#if}`

```
createFragment() → fragment#8                      root() builds the branch, offscreen
createElement("box") → box#9
setAttribute(box#9, "class", "note")
createFragment() → fragment#10
createTextNode("odd") → text#11("odd")
insert(fragment#10, text#11("odd"), null)
insert(box#9, fragment#10, null)
insert(fragment#8, box#9, null)
getFirstChild(fragment#8) → box#9
getParent(comment#7("")) → box#4                   ...and lands it before the anchor
insert(box#4, box#9, comment#7(""))
setText(text#6("0 clicks "), "1 clicks ")
```

```
<box#1>
  <box#2 class="card" on:click>
    #3 "1 clicks "
    <box#4 class="note">
      #5 "odd"
```

The branch is inserted *before* the text update, because the `{#if}` block's effect runs before
the template effect. Neither order should matter to you, which is one reason to batch.

### A click that hides it again

```
remove(box#9)
setText(text#6("1 clicks "), "2 clicks ")
```

One `remove` for the branch's top-level node. That one call covers `text#11` inside it too: the
subtree goes with its root, exactly as with `node.remove()` in a DOM. A keyed `{#each}` dropping
one row looks the same: a single `remove(box#22)`.

## 4. The contract, method by method

The `Renderer` type lives in `svelte/renderer`. Its generics let you say what your fragment,
element, text and comment types are; `createRenderer<{ fragment: Node; element: Node; text:
Node; comment: Node }>` is the usual call when all four are one type.

### Creating nodes

| Method | What Svelte expects |
|---|---|
| `createFragment()` | A container for several nodes. Inserting a fragment must insert all its children and leave it empty. Svelte builds *every* template through one. |
| `createElement(name)` | An element. `name` is the tag as written in the component. |
| `createTextNode(data)` | A text node. Often `" "` or `""`, a slot to be written into later. |
| `createComment(data)` | A comment, used as an anchor for blocks; almost always `""`. It only ever serves as a position to insert before. |

Templates are **rebuilt per instance**. In the DOM, Svelte builds a template once and `cloneNode`s
it per instance; under a custom renderer it calls these four methods again for every instance,
which spares you a `cloneNode` of your own.

### Identity

| Method | What Svelte expects |
|---|---|
| `nodeType(node)` | One of the strings `'fragment'`, `'element'`, `'text'`, `'comment'`. |
| `getNodeValue(node)` | Text content for a text node, the data for a comment, `null` otherwise. |

`getNodeValue` matters more than it looks. `set_text` seeds its per-node diff cache from it on
first write (the `getNodeValue → setText` pair in the trace), so a wrong answer can skip the
first update. And `first_child` skips a *leading empty comment* only when `getNodeValue` returns
`''` for it, so a comment has to return its data.

### Traversal

| Method | What Svelte expects |
|---|---|
| `getFirstChild(node)` | First child of an element or fragment, or `null`. |
| `getLastChild(node)` | Last child, or `null`. |
| `getNextSibling(node)` | Next sibling, or `null`. |
| `getParent(node)` | Parent, or `null`. Called on anchors right before an insert. |

These must include the virtual nodes (comments, blank text, fragments). Svelte is walking the
tree *it* built.

### Mutating the tree

| Method | What Svelte expects |
|---|---|
| `insert(parent, node, anchor)` | Put `node` into `parent` immediately before `anchor`, or at the end when `anchor` is `null`. If `node` is a fragment, insert its children instead. If `node` already has a parent, this is a **move**: take it out of the old place first. Keyed `{#each}` reorders rows this way. |
| `remove(node)` | Take `node` out of its parent. Whatever is under it goes too. |

### Attributes

| Method | What Svelte expects |
|---|---|
| `setAttribute(el, key, value)` | Set it. `value` is usually a string, but `tabindex={0}` arrives as a number and booleans as booleans. |
| `removeAttribute(el, name)` | Remove it. Some paths call `setAttribute` with `null`/`undefined` instead; treat that as a removal. |
| `getAttribute(el, name)` | The value as a string, or `null`. |
| `hasAttribute(el, name)` | Whether it is present. |

Two attributes deserve a warning. `class` arrives as one whole string (`class:` directives are
already merged in). `style` arrives as **CSS text**, and for `style:` directives Svelte reads the
current string back with `getAttribute`, edits it, and writes it again, so the string has to
round-trip byte for byte: if you parse style into your own representation, keep the text too.
Things that are DOM *properties* in a browser (`value`, `checked`, `defaultValue`, `autofocus`)
also arrive through `setAttribute`.

### Text

| Method | What Svelte expects |
|---|---|
| `setText(node, text)` | Replace a text node's content. The signature admits elements and comments too; in practice you see text nodes; accept the others and ignore them. |

### Events

| Method | What Svelte expects |
|---|---|
| `addEventListener(target, type, handler, options?)` | Remember `handler` for `type` (`'click'`, `'mouseenter'`: whatever followed `on` in the component, lowercased). |
| `removeEventListener(target, type, handler, options?)` | Forget that same function. |

Under a custom renderer Svelte **attaches every handler directly to its element** and leaves
propagation to you, where the DOM version delegates and bubbles. It wraps the component's handler
and hands you the wrapper; when your toolkit reports an event, you look up the handlers on the
target and call each one with an event object of your own making, `this` set to the target.
Whether events propagate to ancestors is your decision.

### `foreign` (optional)

`foreign: { insertIntoForeign, insertForeign, removeForeign, removeFromForeign }` is for
interleaving two renderers (a custom renderer inside the DOM, or inside another). Svelte only
consults it when `current_renderer` differs from `parent_renderer`, which takes two renderers to
happen. Leave it out until you need it.

## 5. Your node type: a shadow tree

Your first job is a tree that answers every question above like a DOM would. Slate is the wrong
place for that tree: it knows only elements and text, and blank text there would take up layout
space. So the renderer keeps its own tree, a **shadow tree**, and Slate becomes a projection of
part of it.

```ts
import { createRenderer } from 'svelte/renderer';
import type { Op, Slate, SlateEvent } from './slate.ts';

export type Kind = 'fragment' | 'element' | 'text' | 'comment';

export interface Node {
	kind: Kind;
	name: string;                      // tag, for elements
	data: string;                      // content, for text and comments
	attrs: Record<string, string>;
	listeners: Map<string, Handler[]>;
	id: number | null;                 // Slate's id, once it has one
	live: boolean;                     // reachable from the root
	parent: Node | null;
	first: Node | null;
	last: Node | null;
	prev: Node | null;
	next: Node | null;
}

export interface Event {
	type: string;
	target: Node;
	currentTarget: Node;
	defaultPrevented: boolean;
	preventDefault(): void;
	stopPropagation(): void;
}

export type Handler = (this: Node, event: Event) => void;

let slate: Slate | null = null;
let queue: Op[] = [];
let by_id = new Map<number, Node>();
let pending_destroy = new Set<Node>();
let next_id = 0;

function node(kind: Kind, name = '', data = ''): Node {
	return { kind, name, data, attrs: {}, listeners: new Map(), id: null, live: false, parent: null, first: null, last: null, prev: null, next: null };
}
```

Children are a doubly linked list rather than an array. Every insert Svelte makes is "before
this anchor" and every removal is "this node", so with `prev`/`next` pointers both are O(1):

```ts
function link(parent: Node, child: Node, anchor: Node | null) {
	child.parent = parent;
	if (anchor === null) {
		child.prev = parent.last;
		child.next = null;
		if (parent.last) parent.last.next = child;
		else parent.first = child;
		parent.last = child;
	} else {
		child.prev = anchor.prev;
		child.next = anchor;
		if (anchor.prev) anchor.prev.next = child;
		else parent.first = child;
		anchor.prev = child;
	}
}

function unlink(child: Node) {
	const parent = child.parent;
	if (!parent) return;
	if (child.prev) child.prev.next = child.next;
	else parent.first = child.next;
	if (child.next) child.next.prev = child.prev;
	else parent.last = child.prev;
	child.parent = child.prev = child.next = null;
}
```

With that, half the contract is one-liners:

```ts
type Nodes = { fragment: Node; element: Node; text: Node; comment: Node };

const renderer = createRenderer<Nodes>({
	createFragment: () => node('fragment'),
	createElement: (name) => node('element', name),
	createTextNode: (data) => node('text', '', data),
	createComment: (data) => node('comment', '', data),

	nodeType: (n) => n.kind,
	getNodeValue: (n) => (n.kind === 'text' || n.kind === 'comment' ? n.data : null),

	getFirstChild: (n) => n.first,
	getLastChild: (n) => n.last,
	getNextSibling: (n) => n.next,
	getParent: (n) => n.parent,

	getAttribute: (el, name) => el.attrs[name] ?? null,
	hasAttribute: (el, name) => name in el.attrs,

	// insert, remove, setText, setAttribute, removeAttribute,
	// addEventListener, removeEventListener: section 6
});

export default renderer;
```

If you stopped here and made the remaining methods just edit this tree, you would have a
complete, correct renderer that draws nothing. That is a good first milestone, and a good test
double.

## 6. Projecting the shadow tree onto Slate

The second job is deciding which shadow nodes exist in Slate, when, and how to tell Slate about
them. Six ideas cover it, and together with section 5 they are the whole `renderer.ts`.

### 6.1 Only some nodes are real

Elements and non-blank text get a Slate id. Fragments, comments and blank text stay **virtual**,
ordering-only. That is the whole answer to "Slate has no comments": the anchor lives in the
shadow tree, where Svelte can find it, and only elements and text ever reach Slate.

Blank text is virtual for a different reason: a `" "` node between two boxes would take a slot in
Slate's layout. It becomes real the moment Svelte writes real text into it, and goes back to
virtual if the text is later set to blank.

### 6.2 Ids are allocated lazily, when a node becomes live

Section 3 showed that Svelte builds everything offscreen first. If `createElement` allocated a
Slate node immediately, every template instance would cost a native node before anyone knew
whether it would be shown, and anything abandoned along the way would leak. So the shadow node
gets its id in `materialize()`, which runs when the node first becomes reachable from the root:

```ts
const is_blank = (s: string) => s.trim() === '';

function set_live(n: Node, value: boolean) {
	if (n.live === value) return;
	n.live = value;
	for (let c = n.first; c; c = c.next) set_live(c, value);
}

/** Give a node (and its subtree) Slate ids and emit everything Slate needs to know about it. Idempotent. */
function materialize(n: Node) {
	if (n.kind === 'comment' || n.kind === 'fragment') return;

	if (n.id === null) {
		if (n.kind === 'text' && is_blank(n.data)) return; // an anchor, not content

		n.id = ++next_id;
		by_id.set(n.id, n);

		if (n.kind === 'text') {
			queue.push(['create', n.id, '#text'], ['setText', n.id, n.data]);
			return;
		}

		queue.push(['create', n.id, n.name]);
		for (const key in n.attrs) queue.push(['setAttr', n.id, key, n.attrs[key]]);
		for (const type of n.listeners.keys()) queue.push(['listen', n.id, type, true]);
	}

	for (let c = n.first; c; c = c.next) {
		materialize(c);
		attach(c);
	}
}

function forget(n: Node) {
	if (n.id !== null) {
		by_id.delete(n.id);
		n.id = null;
	}
	for (let c = n.first; c; c = c.next) forget(c);
}
```

Attributes and listeners set *before* the node was live are replayed here. That is why
`setAttribute` and `addEventListener` always record into the shadow node and only additionally
emit an op when `n.id !== null` (6.6).

### 6.3 "Before which node?" is a flat scan of siblings

Slate's `insert` wants the id of the node to insert before, or `null` to append. Svelte gave us a
shadow anchor, which may be a comment with no id. The answer is the nearest *following sibling
that has an id*:

```ts
/** Siblings only: virtual nodes are always leaves, so nothing native hides beneath one. */
function first_native_after(cursor: Node | null): Node | null {
	for (let n = cursor; n; n = n.next) if (n.id !== null) return n;
	return null;
}

/** Place a materialised node under its nearest native parent, before its nearest native following sibling. */
function attach(n: Node) {
	if (n.id === null) return;
	const parent = n.parent;
	if (!parent || parent.kind !== 'element' || parent.id === null) return;
	const before = first_native_after(n.next);
	queue.push(['insert', parent.id, n.id, before ? before.id : null]);
}
```

This scans siblings only, because virtual nodes are always leaves: a comment has no children,
and a fragment is emptied the moment it is inserted. The parent check says the same thing from
the other side: a fragment parent means the node is still offscreen.

### 6.4 `insert` is also `move`; `remove` only marks

```ts
insert(parent, n, anchor) {
	if (n.kind === 'fragment') {
		for (let c = n.first, next: Node | null; c; c = next) {
			next = c.next;
			renderer.insert(parent, c, anchor);
		}
		return;
	}

	if (n.parent) unlink(n); // insert doubles as move
	link(parent, n, anchor);
	set_live(n, parent.live);

	if (n.live) {
		pending_destroy.delete(n); // back before the batch shipped: nothing to destroy
		materialize(n);
		attach(n);                 // Slate reparents an already-placed node
	} else if (n.id !== null) {
		pending_destroy.add(n);    // moved offscreen; gone for good unless it comes back before commit
	}
},

remove(n) {
	if (!n.parent) return;
	unlink(n);
	set_live(n, false);
	// Never destroy here: Svelte removes and re-inserts the same node in consecutive statements.
	pending_destroy.add(n);
},
```

Svelte sometimes calls `remove(n)` and then `insert(..., n, ...)` for the same node in
consecutive statements (the keyed `{#each}` reconciler does, when it resets its anchors). If
`remove` destroyed the Slate node, the following `insert` would refer to an id that no longer
exists. So `remove` only *marks* the node, and destruction waits for `commit()`. An insert that
makes the node live again before then un-marks it, and because Slate's `insert` reparents an
already-placed node, one `insert` op covers a live-to-live move.

The `else if` branch is a node that *had* an id, inserted into an offscreen parent (a fragment
Svelte is holding on to). Slate would keep painting it in its old place unless we destroy
it. If it is shown again later, `materialize` gives it a fresh id and replays its attributes and
listeners from the shadow node.

### 6.5 `setText` follows from 6.1

```ts
setText(n, text) {
	n.data = text;
	if (n.kind !== 'text') return; // a comment's data matters only to Svelte

	if (n.id !== null) {
		if (is_blank(text)) {
			// Going blank hands the id back, or the empty node keeps its slot in Slate's layout.
			queue.push(['remove', n.id]);
			forget(n);
		} else {
			queue.push(['setText', n.id, text]);
		}
	} else if (n.live && !is_blank(text)) {
		materialize(n);
		attach(n);
	}
},
```

### 6.6 Attributes and listeners record first, emit second

```ts
setAttribute(el, key, value) {
	if (value == null) return renderer.removeAttribute(el, key);
	el.attrs[key] = String(value);
	if (el.id !== null) queue.push(['setAttr', el.id, key, el.attrs[key]]);
},

removeAttribute(el, name) {
	if (!(name in el.attrs)) return;
	delete el.attrs[name];
	if (el.id !== null) queue.push(['setAttr', el.id, name, null]);
},

addEventListener(target, type, handler: Handler) {
	let handlers = target.listeners.get(type);
	if (!handlers) target.listeners.set(type, (handlers = []));
	handlers.push(handler);
	if (handlers.length === 1 && target.id !== null) queue.push(['listen', target.id, type, true]);
},

removeEventListener(target, type, handler: Handler) {
	const handlers = target.listeners.get(type);
	if (!handlers) return;
	const i = handlers.indexOf(handler);
	if (i !== -1) handlers.splice(i, 1);
	if (handlers.length === 0) {
		target.listeners.delete(type);
		if (target.id !== null) queue.push(['listen', target.id, type, false]);
	}
}
```

Slate stores a bare "is anyone listening" flag per event type, so only the 0-to-1 and 1-to-0
edges are worth an op; the handler functions themselves stay in the shadow node.

## 7. Mounting, committing, and events

The renderer module also exports a few host-side helpers: how to plug a Slate in, make the one
node that is live by construction, ship a batch, and route an event back.

```ts
export function set_slate(instance: Slate) {
	slate = instance;
	queue = [];
	by_id = new Map();
	pending_destroy = new Set();
}

export function create_root(): Node {
	const root = node('element', 'box');
	root.id = ++next_id;
	root.live = true;
	by_id.set(root.id, root);
	queue.push(['create', root.id, 'box'], ['setRoot', root.id]);
	return root;
}

export function commit() {
	for (const n of pending_destroy) {
		if (!n.live && n.id !== null) {
			queue.push(['remove', n.id]);
			forget(n);
		}
	}
	pending_destroy.clear();

	if (queue.length === 0) return;
	const ops = queue;
	queue = [];
	slate!.apply(ops);
}

export function dispatch({ id, type }: SlateEvent) {
	const target = by_id.get(id);
	const handlers = target?.listeners.get(type);
	if (!target || !handlers) return;

	const event: Event = {
		type,
		target,
		currentTarget: target,
		defaultPrevented: false,
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() {}
	};
	for (const handler of handlers.slice()) handler.call(target, event);
}
```

Every renderer method pushes tuples onto `queue`, and `commit()` is the only thing that hands them
to Slate. The queue's order is the order things happened, so a `create` always precedes the
`insert` that places it, and a `remove` (queued last, at commit) always follows any insert that
rescued one of the subtree's nodes into another parent.

`dispatch` is the reverse projection: Slate reports `{ id, type }`, `by_id` maps the id back to
a shadow node, and the shadow node holds the handlers Svelte registered. The event object is
whatever you decide handlers should receive; component code will read `e.target` and maybe call
`e.preventDefault()`, so give it the DOM-shaped fields it is likely to touch. Propagation is left
out deliberately; a renderer that wants bubbling walks `target.parent` itself.

Mounting a component is then a handful of lines (`main.ts`):

```ts
import { mount, flushSync } from 'svelte';
import renderer, { set_slate, create_root, commit, dispatch } from './renderer.ts';
import { Slate } from './slate.ts';
import App from './App.svelte';

const slate = new Slate((event) => {
	dispatch(event);   // run the Svelte handlers
	flushSync();       // run the effects they dirtied, now
	commit();          // ship what those effects changed as one batch
});

set_slate(slate);
const root = create_root();

// A comment anchor, or mount() appends a text node of its own to serve as one.
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

mount(App, { renderer, target: root, anchor });
flushSync();
commit();
```

`mount` takes the renderer object, a `target` (a node of yours, already live) and an optional
`anchor`. Without an anchor, `mount` creates a *text* node and appends it to the target to serve
as one, and a blank text node is exactly what 6.1 keeps out of Slate, so the host makes a
comment anchor itself.

**When to commit** is the one design question left, with three answers that add up:

- **After mount**: `flushSync()` runs any pending effects, then `commit()` ships the whole
  initial tree as one batch.
- **After every event**: the callback above. `dispatch` runs the handlers, which write state;
  `flushSync` runs the effects that state dirtied *now* rather than on the next microtask;
  `commit` ships the result. The click and its consequences land in one frame.
- **For everything else**: a resolved `fetch`, a `setInterval`, a `$effect` with a timer. Those
  effects run on Svelte's own microtask, with no event to hang a `commit()` on. Either a frame
  loop polls a dirty flag (a toolkit with a tick usually gives you one), or the renderer schedules
  `queueMicrotask(commit)` the first time the queue goes from empty to non-empty. The toy does
  neither, so a timer-driven change would wait for the next click; `gpuix-svelte` does both,
  chosen per platform (section 11).

Running `main.ts` against the appendix's `App.svelte` (a counter, a `{#if count > 2}`, and a keyed
list of three rows), after three clicks on `+` and one on the `beta` row:

```
<box#1>
  <box#2 class="card">
    <box#3>
      #4 "3 clicks"
    <box#5 class="button" on:click>
      #6 "+"
    <box#13 class="note">
      #14 "that is a lot"
    <box#7 class="row" on:click>
      #8 "alpha"
    <box#11 class="row" on:click>
      #12 "gamma"

(12 Slate nodes, 5 batches)
```

The mount was twelve nodes in one batch. The `{#if}` branch got ids 13 and 14 only when it
appeared, and sits *between* the button and the rows because `first_native_after` found `box#7`
past the comment anchor; `beta` and its text are gone (still twelve nodes); each click was one
batch.

## 8. Getting components compiled for your renderer

Three pieces of wiring make the above run, and each bites if it is missing.

### The compiler option

```ts
compile(source, {
	filename,
	generate: 'client',
	runes: true,
	experimental: { customRenderer: './renderer.ts' }
});
```

`customRenderer` takes:

- a **string**: every component defaults to that module, and the string becomes the
  `import $renderer from '...'` specifier verbatim. It is resolved **from the component file's
  location**, so a relative path only works for components next to the renderer; a package name
  or an absolute `file://` URL works from anywhere.
- `true`: the feature is on but components default to the DOM and opt in individually with
  `<svelte:options customRenderer="./renderer.ts" />`.
- a **function** `({ filename }) => string | null | undefined`: decide per file.

A component can also opt *out* with `<svelte:options customRenderer={null} />`.

### The `custom-renderer` export condition

`svelte`'s `package.json` maps `svelte` and `svelte/renderer` to the client build under the
`browser` condition **or** a `custom-renderer` condition, and to the server build otherwise.
Outside a browser, without the condition, `import { mount } from 'svelte'` resolves to the
server build, which lacks `mount`, and `createRenderer` is a stub that throws a message
pointing at the condition. So the process has to run with:

```bash
node --conditions custom-renderer --conditions development ...
```

`development` is read by `esm-env`, which Svelte's runtime imports its `DEV` flag from, so it is
what turns on the descriptive dev-time errors; a production run omits it. Bundlers have an
equivalent (`resolve.conditions` in Vite/esbuild/Bun).

### Something that compiles `.svelte` on import

Node has to be taught to import a `.svelte` file, and a ~20-line loader hook does it (`loader.ts`):

```ts
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

registerHooks({
	load(url, context, nextLoad) {
		if (!url.endsWith('.svelte')) return nextLoad(url, context);
		const path = fileURLToPath(url);
		const { js, warnings } = compile(readFileSync(path, 'utf8'), {
			filename: path,
			generate: 'client',
			runes: true,
			experimental: { customRenderer: './renderer.ts' }
		});
		for (const w of warnings) console.warn(`${path}: ${w.message}`);
		return { format: 'module', shortCircuit: true, source: js.code };
	}
});
```

Declaring `format: 'module'` is what gets the URL past Node's unknown-extension error; no
`resolve` hook is needed. The hook has to be installed before the entry module resolves, hence
`--import`. The command that produced every printout in this document:

```bash
node --conditions custom-renderer --conditions development \
     --import tsx --import ./loader.ts main.ts
```

`tsx` is there because the toy is TypeScript; register it first so it also strips the types out
of `loader.ts`. Bun's equivalent of `registerHooks` is a `Bun.plugin` with an `onLoad` filter for
`/\.svelte$/`, passed as `--preload`.

## 9. What the compiler refuses, and what changes

The compiler knows there is no DOM and says so. With `customRenderer` set, each of these is a
compile **error** (`incompatible_with_custom_renderer`), verified against the vendored build:

- `bind:` in any form. Get hold of a node with `{@attach (node) => ...}` or `use:`; the node you
  receive is *your* shadow node. Pass data down as props and up as callback props.
- `transition:` and `animate:` (they drive `getComputedStyle` and the Web Animations API).
- `on:` (the legacy directive; `onclick={...}` attributes are what work).
- `{@html ...}` (there is no HTML parser to hand the string to).
- `<svelte:window>`, `<svelte:document>`, `<svelte:body>` and `<svelte:head>`.
- `css: 'injected'`. Injecting a `<style>` tag takes a document, so `<style>` blocks come back as
  `css.code` instead, scoped with the `svelte-<hash>` class the compiler has already stamped on
  every matched element. What happens to that CSS is your renderer's call, ignoring it included.

At run time, `createRawSnippet` throws under a custom renderer, and a snippet is bound to the
renderer it was declared in (the compiler wraps every `{#snippet}` in
`renderer_snippet($renderer, fn)`); rendering it while a different renderer is current is an
error. With a single renderer the check always passes.

Things that simply *change*: handlers attached directly, with propagation left to you (section
7); templates rebuilt rather than cloned (section 4); `value`, `checked`, `defaultValue` and `autofocus` arriving as
attributes; hydration off while a renderer is pushed. `<svelte:element this={tag}>`, `{@attach}`
and snippets all work.

## 10. Testing without a screen

Slate is a fake toolkit, and it was built to be one on purpose: it is also a test double. `main.ts`
is already the shape of a test: mount, act through the toolkit's own event path (`slate.click`),
assert on what the toolkit holds (`print()`, node count, batch count). Clicking through Slate
rather than calling `dispatch()` directly matters, because it also checks that the `listen` op
reached the right id, which is exactly what a wrong `first_native_after` or a missed
`materialize` breaks.

The traces in section 3 come from a `Proxy` around the renderer that logs every call. Keep one
around: when a `{#each}` reorder goes wrong, "what did Svelte ask, and what did we answer" is the
question, and the log answers it.

Cases worth a test in any renderer, since each exercises a different branch of section 6:

- a `{#if}` that flips on and off (offscreen build, insert before an anchor, subtree remove),
- a keyed `{#each}` reordered, with a row removed and one added (moves, remove-then-insert),
- text that becomes `''` and then non-empty again (virtual to real to virtual),
- a listener added after mount and removed again (the replay in `materialize`, the 1-to-0 edge),
- a component unmounted and a new one mounted into the same root (ids must not collide).

## 11. Where gpuix-svelte goes further

Everything above is `gpuix-svelte` with the toolkit-specific parts filed off; the same ideas
appear under the same names.

- **`src/renderer.ts`** is sections 5 to 7 for GPUI: the shadow tree, lazy `nativeId`s,
  `first_native_after`, `pending_destroy`, one `applyBatch(json)` per `commit()`. On top of the
  toy it turns `style` text into GPUI style objects (`style.ts`), applies `<style>` class rules
  on every `class` change, maps event names onto GPUI's spellings (`events.ts`), handles
  `hitbox="self"` pointer shielding, and supports `<Portal>` by hanging a node's native twin off
  the root instead of its parent. `applyBatch` returns the ids GPUI destroyed, where the toy's
  `forget` walks its own subtree.
- **`src/render.ts`** is the window, `create_root`, the comment anchor, `mount(..., { renderer,
  target, anchor })`, and `dispatch → flushSync → commit` on every native event. It answers "when
  to commit for everything else" both ways: a paced `setTimeout` loop calling `native.tick()`, or
  `set_auto_commit(true)` where the toolkit owns the UI thread.
- **`src/compile.ts`** is section 8's compiler call, plus what section 9 leaves to you: it walks
  the `<style>` AST and emits a `define_styles(scope, rules)` call into the component, and it
  rewrites child `.svelte` specifiers with a cache-busting query for hot reload.
- **`src/register.ts`** and **`src/plugin.ts`** are the two loaders; **`bin/gpuix-svelte.js`** is
  section 8's command line with the conditions and imports baked in.
- **`src/test.ts`** is section 10 against a real headless GPU pipeline instead of Slate.

`CLAUDE.md`'s "Architecture" section is the reference for all of it.

## 12. Appendix: the rest of the toy

`renderer.ts` is sections 5, 6 and 7 assembled in one file, in that order; `loader.ts` is in
section 8 and `Tiny.svelte` in section 3. The three remaining files are here.
Alongside them sit a `node_modules` containing `svelte` (the custom-renderer build) and `tsx`,
and a `package.json` reading `{ "type": "module" }`.

### `slate.ts`

```ts
export type Op =
	| ['create', number, string]                     // id, tag ('#text' for a text node)
	| ['setText', number, string]
	| ['setAttr', number, string, string | null]      // null removes
	| ['insert', number, number, number | null]       // parent, id, before (null = append); reparents if already placed
	| ['remove', number]                              // destroys the subtree
	| ['listen', number, string, boolean]
	| ['setRoot', number];

export interface SlateEvent {
	id: number;
	type: string;
}

interface SlateNode {
	id: number;
	tag: string;
	text: string;
	attrs: Map<string, string>;
	listening: Set<string>;
	parent: SlateNode | null;
	children: SlateNode[];
}

export class Slate {
	#nodes = new Map<number, SlateNode>();
	#root: SlateNode | null = null;
	#onEvent: (event: SlateEvent) => void;
	batches = 0;

	constructor(onEvent: (event: SlateEvent) => void) {
		this.#onEvent = onEvent;
	}

	apply(ops: Op[]) {
		this.batches++;
		for (const op of ops) {
			switch (op[0]) {
				case 'create':
					this.#nodes.set(op[1], { id: op[1], tag: op[2], text: '', attrs: new Map(), listening: new Set(), parent: null, children: [] });
					break;
				case 'setText':
					this.#get(op[1]).text = op[2];
					break;
				case 'setAttr': {
					const n = this.#get(op[1]);
					if (op[3] === null) n.attrs.delete(op[2]);
					else n.attrs.set(op[2], op[3]);
					break;
				}
				case 'insert': {
					const parent = this.#get(op[1]);
					const child = this.#get(op[2]);
					this.#detach(child);
					const at = op[3] === null ? parent.children.length : parent.children.indexOf(this.#get(op[3]));
					if (at === -1) throw new Error(`insert: ${op[3]} is not a child of ${op[1]}`);
					parent.children.splice(at, 0, child);
					child.parent = parent;
					break;
				}
				case 'remove': {
					const n = this.#get(op[1]);
					this.#detach(n);
					this.#destroy(n);
					break;
				}
				case 'listen': {
					const n = this.#get(op[1]);
					if (op[3]) n.listening.add(op[2]);
					else n.listening.delete(op[2]);
					break;
				}
				case 'setRoot':
					this.#root = this.#get(op[1]);
					break;
			}
		}
	}

	/** The user clicked the node with this id; Slate reports it, like any toolkit would. */
	click(id: number) {
		if (!this.#get(id).listening.has('click')) return;
		this.#onEvent({ id, type: 'click' });
	}

	/** The id of the first node whose text is exactly this, or of the element around it. */
	find(text: string, { element = false } = {}): number {
		const hit = this.#walk(this.#root, (n) => n.tag === '#text' && n.text === text);
		if (!hit) throw new Error(`no text node reads "${text}"`);
		return element ? hit.parent!.id : hit.id;
	}

	print(): string {
		const lines: string[] = [];
		const visit = (n: SlateNode, depth: number) => {
			const attrs = [...n.attrs].map(([k, v]) => ` ${k}="${v}"`).join('');
			const events = n.listening.size ? ` on:${[...n.listening].join(',')}` : '';
			if (n.tag === '#text') {
				lines.push(`${'  '.repeat(depth)}#${n.id} ${JSON.stringify(n.text)}`);
				return;
			}
			lines.push(`${'  '.repeat(depth)}<${n.tag}#${n.id}${attrs}${events}>`);
			for (const c of n.children) visit(c, depth + 1);
		};
		if (this.#root) visit(this.#root, 0);
		return lines.join('\n');
	}

	get size() {
		return this.#nodes.size;
	}

	#get(id: number) {
		const n = this.#nodes.get(id);
		if (!n) throw new Error(`Slate has no node ${id}`);
		return n;
	}

	#detach(n: SlateNode) {
		if (!n.parent) return;
		n.parent.children.splice(n.parent.children.indexOf(n), 1);
		n.parent = null;
	}

	#destroy(n: SlateNode) {
		this.#nodes.delete(n.id);
		for (const c of n.children) this.#destroy(c);
	}

	#walk(n: SlateNode | null, pred: (n: SlateNode) => boolean): SlateNode | null {
		if (!n) return null;
		if (pred(n)) return n;
		for (const c of n.children) {
			const hit = this.#walk(c, pred);
			if (hit) return hit;
		}
		return null;
	}
}
```

### `App.svelte`

```svelte
<script>
	let count = $state(0);
	let items = $state(['alpha', 'beta', 'gamma']);
</script>

<box class="card">
	<box>{count} clicks</box>
	<box class="button" onclick={() => count++}>+</box>
	{#if count > 2}
		<box class="note">that is a lot</box>
	{/if}
	{#each items as item (item)}
		<box class="row" onclick={() => (items = items.filter((i) => i !== item))}>{item}</box>
	{/each}
</box>
```

### The tail of `main.ts`

After the mount shown in section 7:

```ts
console.log(slate.print());
console.log(`\n(${slate.size} Slate nodes, ${slate.batches} batch)\n`);

for (let i = 0; i < 3; i++) slate.click(slate.find('+', { element: true }));
slate.click(slate.find('beta', { element: true }));

console.log(slate.print());
console.log(`\n(${slate.size} Slate nodes, ${slate.batches} batches)`);
```

```bash
node --conditions custom-renderer --conditions development \
     --import tsx --import ./loader.ts main.ts
```
