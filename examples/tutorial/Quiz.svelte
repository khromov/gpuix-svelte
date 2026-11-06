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
		if (picked === null) return 'background-color: #111111; border-color: #242424; color: #ededed';
		if (i === answer) return 'background-color: #4cc38a26; border-color: #4cc38a; color: #4cc38a';
		if (i === picked) return 'background-color: #ff616626; border-color: #ff6166; color: #ff6166';
		return 'background-color: #111111; border-color: #242424; color: #8f8f8f';
	}
</script>

<div
	style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background-color: #111111;
	       border-radius: 10px; border-width: 1px; border-color: #242424"
>
	<div style="font-size: 11px; font-weight: 600; color: #ff8a5c">QUIZ</div>
	<div style="font-size: 13px; line-height: 19px; color: #ededed">{question}</div>

	{#each options as option, i (option)}
		<div
			style="padding: 8px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px;
			       user-select: none; {option_style(i)}"
			style:cursor={picked === null ? 'pointer' : 'default'}
			hover={picked === null ? 'background-color: #1c1c1c; border-color: #404040' : null}
			onclick={() => picked === null && onpick(i)}
		>
			{String.fromCharCode(65 + i)}. {option}
		</div>
	{/each}

	{#if picked !== null}
		<div style="font-size: 12px; line-height: 18px" style:color={picked === answer ? '#4cc38a' : '#ff6166'}>
			{picked === answer ? 'Correct.' : 'Not quite.'} {explanation}
		</div>
	{/if}
</div>
