<script lang="ts">
	import { spawn } from 'node:child_process';

	type Story = { id: number; title: string; url?: string; by: string; score: number; time: number; descendants?: number };

	const API = 'https://hacker-news.firebaseio.com/v0';
	const FEEDS = ['top', 'new', 'best'];
	const COUNT = 25;

	let feed = $state('top');
	let stories = $state<Story[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let generation = 0;

	async function load() {
		const gen = ++generation;
		loading = true;
		error = null;
		try {
			const ids: number[] = await (await fetch(`${API}/${feed}stories.json`)).json();
			const items = await Promise.all(
				ids.slice(0, COUNT).map(async (id): Promise<Story | null> => (await fetch(`${API}/item/${id}.json`)).json())
			);
			if (gen !== generation) return;
			stories = items.filter((s): s is Story => s !== null);
		} catch (err) {
			if (gen !== generation) return;
			error = (err as Error).message;
		} finally {
			if (gen === generation) loading = false;
		}
	}

	function setFeed(name: string) {
		if (feed === name) return;
		feed = name;
		load();
	}

	function open(story: Story) {
		const url = story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
		const cmd =
			process.platform === 'darwin' ? ['open', url]
			: process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
			: ['xdg-open', url];
		const child = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true });
		// An unhandled 'error' event (no xdg-open on the box) would take the window down with it.
		child.on('error', (err) => console.error('[hacker-news] could not open browser:', err.message));
		child.unref();
	}

	function domain(story: Story) {
		try {
			return new URL(story.url!).hostname.replace(/^www\./, '');
		} catch {
			return 'news.ycombinator.com';
		}
	}

	function age(story: Story) {
		const mins = Math.max(1, Math.round((Date.now() / 1000 - story.time) / 60));
		if (mins < 60) return `${mins}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		return `${Math.round(mins / (60 * 24))}d ago`;
	}

	load();
</script>

<div
	style="display: flex; flex-direction: column; width: 100%; height: 100%;
	       background-color: #000000"
>
	<div
		style="display: flex; flex-direction: row; align-items: center; gap: 16px;
		       padding: 14px; padding-left: 20px; padding-right: 20px; background-color: #111111;
		       border-bottom-width: 1px; border-color: #242424"
	>
		<div style="color: #ff8a5c; font-size: 18px; font-weight: 600">Hacker News</div>

		<div style="display: flex; flex-direction: row; gap: 6px; flex-grow: 1">
			{#each FEEDS as name (name)}
				<div
					style="padding: 6px; padding-left: 14px; padding-right: 14px; border-radius: 999px;
					       font-size: 13px; cursor: pointer"
					style:background-color={feed === name ? '#ededed' : '#1c1c1c'}
					style:color={feed === name ? '#000000' : '#a1a1a1'}
					style:font-weight={feed === name ? '600' : 'normal'}
					hover="opacity: 0.85"
					onclick={() => setFeed(name)}
				>
					{name}
				</div>
			{/each}
		</div>

		<div
			style="padding: 6px; padding-left: 14px; padding-right: 14px; border-radius: 8px;
			       border-width: 1px; border-color: #242424; color: #ededed; font-size: 13px; cursor: pointer"
			hover="background-color: #1c1c1c; border-color: #404040"
			onclick={load}
		>
			refresh
		</div>
	</div>

	{#if loading}
		<div style="display: flex; align-items: center; justify-content: center; flex-grow: 1">
			<div style="color: #a1a1a1; font-size: 14px">loading {feed} stories…</div>
		</div>
	{:else if error}
		<div
			style="display: flex; flex-direction: column; align-items: center; justify-content: center;
			       gap: 12px; flex-grow: 1"
		>
			<div style="color: #ff6166; font-size: 14px">failed to load: {error}</div>
			<div
				style="padding: 8px; padding-left: 16px; padding-right: 16px; border-radius: 8px;
				       border-width: 1px; border-color: #242424; color: #ededed; font-size: 13px; cursor: pointer"
				hover="background-color: #1c1c1c; border-color: #404040"
				onclick={load}
			>
				retry
			</div>
		</div>
	{:else}
		<div
			style="display: flex; flex-direction: column; flex-grow: 1; overflow-y: scroll;
			       padding: 12px; gap: 8px"
		>
			{#each stories as story, rank (story.id)}
				<div
					style="display: flex; flex-direction: row; gap: 12px; padding: 12px;
					       background-color: #111111; border-width: 1px; border-color: #242424;
					       border-radius: 8px; cursor: pointer"
					hover="background-color: #1c1c1c; border-color: #404040"
					onclick={() => open(story)}
				>
					<div style="color: #8f8f8f; font-size: 14px; min-width: 24px; text-align: right">
						{rank + 1}
					</div>
					<div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1">
						<div style="color: #ededed; font-size: 14px">{story.title}</div>
						<div style="display: flex; flex-direction: row; gap: 10px; font-size: 12px">
							<div style="color: #ff8a5c">{story.score ?? 0} points</div>
							<div style="color: #a1a1a1">by {story.by}</div>
							<div style="color: #a1a1a1">{age(story)}</div>
							<div style="color: #a1a1a1">{story.descendants ?? 0} comments</div>
							<div style="color: #8f8f8f">{domain(story)}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
