/**
 * Proves the ML stack runs under Bun before anything is built on it: the
 * transformers.js import, its ONNX backend, sharp, and one inference per model.
 * Run with `npm run brain:doctor`; the first run downloads ~400 MB into .data/models.
 */

if (!process.versions.bun) {
	console.error('[doctor] needs Bun — `npm run brain:doctor` runs `bun examples/second-brain/ml/doctor.ts`');
	process.exit(1);
}

const t0 = performance.now();
const lap = (label: string, since: number) => console.log(`[doctor] ${label}: ${(performance.now() - since).toFixed(0)} ms`);
const progress = (p: { status: string; file?: string; progress?: number }) => {
	if (p.status === 'progress') process.stdout.write(`\r  ${p.file} ${p.progress?.toFixed(0)}%   `);
	if (p.status === 'done') process.stdout.write(`\r  ${p.file} done          \n`);
};

const tf = await import('@huggingface/transformers');
const {
	env,
	pipeline,
	RawImage,
	AutoProcessor,
	AutoTokenizer,
	CLIPVisionModelWithProjection,
	CLIPTextModelWithProjection
} = tf;
console.log(`[doctor] transformers.js ${env.version} | WhisperTextStreamer: ${typeof tf.WhisperTextStreamer}`);

env.cacheDir = process.env.GPUIX_BRAIN_MODELS_DIR ?? new URL('../.data/models/', import.meta.url).pathname;
env.allowLocalModels = false;
const device = process.env.GPUIX_BRAIN_ML === 'wasm' ? 'wasm' : undefined;
console.log(`[doctor] cacheDir ${env.cacheDir} | device ${device ?? 'default'}`);

let s = performance.now();
const embed = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
	dtype: 'q8',
	device,
	progress_callback: progress
});
lap('embed load', s);
s = performance.now();
const e = await embed(
	['search_document: Substrate remembers everything you pour into it.', 'search_query: what does substrate remember?'],
	{ pooling: 'mean', normalize: true }
);
const dim: number = e.dims[1];
const a: Float32Array = e.data.subarray(0, dim);
const b: Float32Array = e.data.subarray(dim, 2 * dim);
let dot = 0;
for (let i = 0; i < dim; i++) dot += a[i] * b[i];
console.log(`[doctor] embed dims ${JSON.stringify(e.dims)} | cosine(doc, query) = ${dot.toFixed(3)}`);
lap('embed infer', s);

s = performance.now();
const sharp = (await import('sharp')).default;
const png: Buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e08030' } })
	.png()
	.toBuffer();
console.log(`[doctor] sharp ok, ${png.length}-byte png`);
lap('sharp', s);

s = performance.now();
const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
	dtype: 'q8',
	device,
	progress_callback: progress
});
lap('whisper load', s);
s = performance.now();
const sine = Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000));
const out = await asr(sine, {
	chunk_length_s: 30,
	stride_length_s: 5,
	return_timestamps: true,
	language: 'en',
	task: 'transcribe'
});
console.log(`[doctor] whisper: ${JSON.stringify(out).slice(0, 200)}`);
lap('whisper infer', s);

s = performance.now();
const CLIP = 'Xenova/clip-vit-base-patch32';
const processor = await AutoProcessor.from_pretrained(CLIP, { progress_callback: progress });
const vision = await CLIPVisionModelWithProjection.from_pretrained(CLIP, { dtype: 'q8', device, progress_callback: progress });
const tokenizer = await AutoTokenizer.from_pretrained(CLIP);
const text = await CLIPTextModelWithProjection.from_pretrained(CLIP, { dtype: 'q8', device, progress_callback: progress });
lap('clip load', s);
s = performance.now();
const image = await RawImage.fromBlob(new Blob([png]));
const { image_embeds } = await vision(await processor(image));
const { text_embeds } = await text(tokenizer(['an orange square'], { padding: true, truncation: true }));
console.log(`[doctor] clip image dims ${JSON.stringify(image_embeds.dims)} | text dims ${JSON.stringify(text_embeds.dims)}`);
lap('clip infer', s);

lap('total', t0);
