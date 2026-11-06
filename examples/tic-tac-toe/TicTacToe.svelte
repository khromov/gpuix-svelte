<script lang="ts">
	import { onMount } from 'svelte';
	import { check_for_update, type Update } from 'gpuix-svelte/update';

	type Mark = 'X' | 'O';

	// The built app (npm run compile) checks the manifest each gpuix-svelte release uploads; under
	// npm run demo:tictactoe there is no manifest and this stays null.
	let update = $state<Update | null>(null);
	let progress = $state<number | null>(null);
	let updateError = $state('');

	onMount(() => {
		check_for_update().then((found) => (update = found), (e) => console.warn('update check failed:', e));
	});

	async function install() {
		try {
			await update!.download({ onProgress: (received, total) => (progress = total ? received / total : null) });
			await update!.install();
		} catch (e) {
			updateError = (e as Error).message;
		}
	}

	let board = $state<(Mark | null)[]>(Array(9).fill(null));
	let xIsNext = $state(true);
	let scores = $state<Record<Mark | 'draws', number>>({ X: 0, O: 0, draws: 0 });

	const LINES = [
		[0, 1, 2], [3, 4, 5], [6, 7, 8],
		[0, 3, 6], [1, 4, 7], [2, 5, 8],
		[0, 4, 8], [2, 4, 6]
	];

	let winningLine = $derived(LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null);
	let winner = $derived(winningLine ? board[winningLine[0]] : null);
	let isDraw = $derived(!winner && board.every(Boolean));
	let status = $derived(
		winner ? `${winner} wins!` : isDraw ? "It's a draw" : `${xIsNext ? 'X' : 'O'} to move`
	);

	function play(i: number) {
		if (board[i] || winner) return;
		board[i] = xIsNext ? 'X' : 'O';
		xIsNext = !xIsNext;
		// Reading the deriveds back after the move is what scores the round exactly once: the
		// guard above refuses any further move into a won board.
		if (winner) scores[winner]++;
		else if (isDraw) scores.draws++;
	}

	function newRound() {
		board = Array(9).fill(null);
		xIsNext = true;
	}

	function resetScores() {
		newRound();
		scores = { X: 0, O: 0, draws: 0 };
	}

	function cellColor(i: number) {
		if (winningLine?.includes(i)) return '#4cc38a';
		return board[i] === 'X' ? '#ededed' : '#ff8a5c';
	}
</script>

<div
	style="display: flex; flex-direction: column; align-items: center; justify-content: center;
	       gap: 20px; width: 100%; height: 100%; background-color: #000000; padding: 24px"
>
	<div style="color: #ededed; font-size: 24px; font-weight: 600">Tic-tac-toe</div>

	{#if update}
		<div style="display: flex; flex-direction: row; align-items: center; gap: 12px; color: #ededed; font-size: 14px">
			<div>Version {update.version} is available</div>
			{#if updateError}
				<div style="color: #ff6166">{updateError}</div>
			{:else if update.installable}
				<div
					style="padding: 6px; padding-left: 14px; padding-right: 14px; border-radius: 8px;
					       background-color: #ededed; color: #000000; font-weight: 600; cursor: pointer"
					hover="background-color: #ffffff"
					onclick={install}
				>
					{progress === null ? 'Install and restart' : `${Math.round(progress * 100)}%`}
				</div>
			{:else if update.url}
				<div style="color: #a1a1a1">Get it at {update.url}</div>
			{/if}
		</div>
	{/if}

	<div
		style="font-size: 16px"
		style:color={winner ? '#4cc38a' : isDraw ? '#f5a524' : '#a1a1a1'}
	>
		{status}
	</div>

	<div
		style="display: flex; flex-direction: column; gap: 8px; padding: 16px;
		       background-color: #0a0a0a; border-width: 1px; border-color: #242424; border-radius: 12px"
	>
		{#each [0, 1, 2] as row (row)}
			<div style="display: flex; flex-direction: row; gap: 8px">
				{#each [0, 1, 2] as col (col)}
					{@const i = row * 3 + col}
					<div
						style="display: flex; align-items: center; justify-content: center;
						       width: 80px; height: 80px; border-radius: 8px; background-color: #1a1a1a"
						style:cursor={board[i] || winner ? 'default' : 'pointer'}
						hover="background-color: #262626"
						onclick={() => play(i)}
					>
						{#if board[i]}
							<div style="font-size: 40px; font-weight: 600" style:color={cellColor(i)}>
								{board[i]}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<div style="display: flex; flex-direction: row; gap: 24px; color: #a1a1a1; font-size: 14px">
		<div style="color: #ededed">X: {scores.X}</div>
		<div style="color: #ff8a5c">O: {scores.O}</div>
		<div>draws: {scores.draws}</div>
	</div>

	<div style="display: flex; flex-direction: row; gap: 12px">
		<div
			style="padding: 10px; padding-left: 20px; padding-right: 20px; border-radius: 8px;
			       border-width: 1px; border-color: #ededed; background-color: #ededed; color: #000000;
			       font-size: 14px; font-weight: 600; cursor: pointer"
			hover="background-color: #ffffff; border-color: #ffffff"
			onclick={newRound}
		>
			New round
		</div>
		<div
			style="padding: 10px; padding-left: 20px; padding-right: 20px; border-radius: 8px;
			       border-width: 1px; border-color: #242424; color: #ededed; font-size: 14px;
			       font-weight: 500; cursor: pointer"
			hover="background-color: #1a1a1a; border-color: #404040"
			onclick={resetScores}
		>
			Reset scores
		</div>
	</div>
</div>
