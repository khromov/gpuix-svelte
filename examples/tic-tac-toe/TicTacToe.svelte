<script>
	let board = $state(Array(9).fill(null));
	let xIsNext = $state(true);
	let scores = $state({ X: 0, O: 0, draws: 0 });
	let counted = $state(false);

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

	$effect(() => {
		if (counted) return;
		if (winner) {
			scores[winner]++;
			counted = true;
		} else if (isDraw) {
			scores.draws++;
			counted = true;
		}
	});

	function play(i) {
		if (board[i] || winner) return;
		board[i] = xIsNext ? 'X' : 'O';
		xIsNext = !xIsNext;
	}

	function newRound() {
		board = Array(9).fill(null);
		xIsNext = true;
		counted = false;
	}

	function resetScores() {
		newRound();
		scores = { X: 0, O: 0, draws: 0 };
	}

	function cellColor(i) {
		if (winningLine?.includes(i)) return '#a6e3a1';
		return board[i] === 'X' ? '#89b4fa' : '#f38ba8';
	}
</script>

<div
	style="display: flex; flex-direction: column; align-items: center; justify-content: center;
	       gap: 20px; width: 100%; height: 100%; background-color: #11111b; padding: 24px"
>
	<div style="color: #cdd6f4; font-size: 24px; font-weight: bold">Tic-tac-toe</div>

	<div
		style="font-size: 16px"
		style:color={winner ? '#a6e3a1' : isDraw ? '#f9e2af' : '#a6adc8'}
	>
		{status}
	</div>

	<div
		style="display: flex; flex-direction: column; gap: 8px; padding: 16px;
		       background-color: #1e1e2e; border-radius: 12px"
	>
		{#each [0, 1, 2] as row}
			<div style="display: flex; flex-direction: row; gap: 8px">
				{#each [0, 1, 2] as col}
					{@const i = row * 3 + col}
					<div
						style="display: flex; align-items: center; justify-content: center;
						       width: 80px; height: 80px; border-radius: 8px; background-color: #313244"
						style:cursor={board[i] || winner ? 'default' : 'pointer'}
						hover="background-color: #45475a"
						onclick={() => play(i)}
					>
						{#if board[i]}
							<div style="font-size: 40px; font-weight: bold" style:color={cellColor(i)}>
								{board[i]}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<div style="display: flex; flex-direction: row; gap: 24px; color: #a6adc8; font-size: 14px">
		<div style="color: #89b4fa">X: {scores.X}</div>
		<div style="color: #f38ba8">O: {scores.O}</div>
		<div>draws: {scores.draws}</div>
	</div>

	<div style="display: flex; flex-direction: row; gap: 12px">
		<div
			style="padding: 10px; padding-left: 20px; padding-right: 20px; border-radius: 8px;
			       background-color: #89b4fa; color: #1e1e2e; font-size: 14px; font-weight: bold;
			       cursor: pointer"
			hover="background-color: #b4befe"
			onclick={newRound}
		>
			New round
		</div>
		<div
			style="padding: 10px; padding-left: 20px; padding-right: 20px; border-radius: 8px;
			       background-color: #313244; color: #bac2de; font-size: 14px; cursor: pointer"
			hover="background-color: #45475a"
			onclick={resetScores}
		>
			Reset scores
		</div>
	</div>
</div>
