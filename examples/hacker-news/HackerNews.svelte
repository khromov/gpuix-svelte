<script>
	const API = 'https://hacker-news.firebaseio.com/v0';
	const FEEDS = ['top', 'new', 'best'];
	const COUNT = 25;

	let feed = $state('top');
	let stories = $state([]);
	let loading = $state(true);
	let error = $state(null);
	let generation = 0;

	async function load() {
		const gen = ++generation;
		loading = true;
		error = null;
		try {
			const ids = await (await fetch(`${API}/${feed}stories.json`)).json();
			const items = await Promise.all(
				ids.slice(0, COUNT).map(async (id) => (await fetch(`${API}/item/${id}.json`)).json())
			);
			if (gen !== generation) return;
			stories = items.filter(Boolean);
		} catch (err) {
			if (gen !== generation) return;
			error = err.message;
		} finally {
			if (gen === generation) loading = false;
		}
	}

	function setFeed(name) {
		if (feed === name) return;
		feed = name;
		load();
	}

	function open(story) {
		const url = story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
		const cmd =
			process.platform === 'darwin' ? ['open', url]
			: process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
			: ['xdg-open', url];
		Bun.spawn(cmd);
	}

	function domain(story) {
		try {
			return new URL(story.url).hostname.replace(/^www\./, '');
		} catch {
			return 'news.ycombinator.com';
		}
	}

	function age(story) {
		const mins = Math.max(1, Math.round((Date.now() / 1000 - story.time) / 60));
		if (mins < 60) return `${mins}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		return `${Math.round(mins / (60 * 24))}d ago`;
	}

	load();
</script>

<div
	style="display: flex; flex-direction: column; width: 100%; height: 100%;
	       background-color: #11111b"
>
	<div
		style="display: flex; flex-direction: row; align-items: center; gap: 16px;
		       padding: 14px; padding-left: 20px; padding-right: 20px; background-color: #1e1e2e"
	>
		<div style="color: #fab387; font-size: 18px; font-weight: bold">Hacker News</div>

		<div style="display: flex; flex-direction: row; gap: 6px; flex-grow: 1">
			{#each FEEDS as name (name)}
				<div
					style="padding: 6px; padding-left: 14px; padding-right: 14px; border-radius: 6px;
					       font-size: 13px; cursor: pointer"
					style:background-color={feed === name ? '#fab387' : '#313244'}
					style:color={feed === name ? '#1e1e2e' : '#a6adc8'}
					style:font-weight={feed === name ? 'bold' : 'normal'}
					hover="opacity: 0.85"
					onclick={() => setFeed(name)}
				>
					{name}
				</div>
			{/each}
		</div>

		<div
			style="padding: 6px; padding-left: 14px; padding-right: 14px; border-radius: 6px;
			       background-color: #313244; color: #bac2de; font-size: 13px; cursor: pointer"
			hover="background-color: #45475a"
			onclick={load}
		>
			refresh
		</div>
	</div>

	{#if loading}
		<div style="display: flex; align-items: center; justify-content: center; flex-grow: 1">
			<div style="color: #6c7086; font-size: 14px">loading {feed} stories…</div>
		</div>
	{:else if error}
		<div
			style="display: flex; flex-direction: column; align-items: center; justify-content: center;
			       gap: 12px; flex-grow: 1"
		>
			<div style="color: #f38ba8; font-size: 14px">failed to load: {error}</div>
			<div
				style="padding: 8px; padding-left: 16px; padding-right: 16px; border-radius: 6px;
				       background-color: #313244; color: #bac2de; font-size: 13px; cursor: pointer"
				hover="background-color: #45475a"
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
					       background-color: #1e1e2e; border-radius: 8px; cursor: pointer"
					hover="background-color: #313244"
					onclick={() => open(story)}
				>
					<div style="color: #6c7086; font-size: 14px; min-width: 24px; text-align: right">
						{rank + 1}
					</div>
					<div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1">
						<div style="color: #cdd6f4; font-size: 14px">{story.title}</div>
						<div style="display: flex; flex-direction: row; gap: 10px; font-size: 12px">
							<div style="color: #fab387">{story.score ?? 0} points</div>
							<div style="color: #6c7086">by {story.by}</div>
							<div style="color: #6c7086">{age(story)}</div>
							<div style="color: #6c7086">{story.descendants ?? 0} comments</div>
							<div style="color: #45475a">{domain(story)}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
