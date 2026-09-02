<script lang="ts">
	let {
		question,
		options,
		answer,
		explanation,
		picked = null,
		onpick
	}: { question: string; options: string[]; answer: number; explanation: string; picked?: number | null; onpick: (i: number) => void } = $props();

	function option_style(i: number) {
		if (picked === null) return 'background-color: #313244; border-color: #313244; color: #cdd6f4';
		if (i === answer) return 'background-color: #a6e3a1; border-color: #a6e3a1; color: #1e1e2e';
		if (i === picked) return 'background-color: #f38ba8; border-color: #f38ba8; color: #1e1e2e';
		return 'background-color: #313244; border-color: #313244; color: #6c7086';
	}
</script>

<div
	style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background-color: #181825;
	       border-radius: 8px; border-width: 1px; border-color: #313244"
>
	<div style="font-size: 11px; font-weight: bold; color: #f9e2af">QUIZ</div>
	<div style="font-size: 13px; line-height: 19px; color: #cdd6f4">{question}</div>

	{#each options as option, i (option)}
		<div
			style="padding: 8px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px;
			       user-select: none; {option_style(i)}"
			style:cursor={picked === null ? 'pointer' : 'default'}
			hover={picked === null ? 'background-color: #45475a' : null}
			onclick={() => picked === null && onpick(i)}
		>
			{String.fromCharCode(65 + i)}. {option}
		</div>
	{/each}

	{#if picked !== null}
		<div style="font-size: 12px; line-height: 18px" style:color={picked === answer ? '#a6e3a1' : '#f38ba8'}>
			{picked === answer ? 'Correct.' : 'Not quite.'} {explanation}
		</div>
	{/if}
</div>
