import { ToolPage } from '@/components/common/ToolPage'
import { ImageToolWorkbench } from './ImageToolWorkbench'

export const ImageCompressorPage = () => (
  <ToolPage title="Image Compressor" description="Compress JPG, PNG and WebP images in your browser. Single files or whole batches, with a before and after view and the real result for every file."
    about={<>
      <p><strong>How each format is compressed.</strong> JPG and WebP are re-encoded at the quality you choose; if the first try is not smaller than your file, up to two lower qualities are tried and the quality actually used is shown. PNG stays PNG: High Quality re-encodes it losslessly, while Balanced and Low Size reduce the palette to 256 or 128 colours (lossy, no dithering, transparency kept).</p>
      <p><strong>Honest results.</strong> Dimensions are kept unless you opt in to resizing. If no smaller valid file is possible, your original is kept and the result says 0% saved. If a result is larger, you see the actual increase. Every result is re-opened and checked (real format, decodes, correct size, transparency kept) before it is offered. A colour-reduced PNG is also compared with your image pixel by pixel; if it would visibly change it, colour reduction is skipped and only lossless compression is used.</p>
      <p><strong>What is not preserved.</strong> EXIF and GPS data and colour profiles are removed and colours are converted to sRGB. Animated GIF, APNG and WebP files are refused rather than flattened, unless you opt in to first-frame-only. To compress GIF, BMP, TIFF, AVIF, ICO or SVG files, convert them first with the Image Converter. HEIC is not supported yet.</p>
      <p>Processing happens locally in your browser; images are not uploaded.</p></>}>
    <ImageToolWorkbench mode="compress" />
  </ToolPage>
)
export const ImageResizerPage = () => (
  <ToolPage title="Image Resizer" description="Resize images by maximum width and height while keeping the aspect ratio. Works with JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, ICO and SVG."
    about={<>
      <p>Images are only made smaller unless you explicitly allow enlarging (SVG is a vector, so it renders at the size you ask for). By default each image keeps its format; formats a browser cannot write (GIF, BMP, TIFF, AVIF, ICO, SVG) are saved as PNG, and you can choose another output instead.</p>
      <p>TIFF files use only their first page. Animated images are refused unless you opt in to first-frame-only. Metadata is removed and colours are converted to sRGB.</p></>}>
    <ImageToolWorkbench mode="resize" />
  </ToolPage>
)
export const ImageConverterPage = () => (
  <ToolPage title="Image Converter" description="Convert GIF, BMP, TIFF, AVIF, ICO, SVG, JPG, PNG and WebP images to JPG, PNG or WebP locally in your browser."
    about={<>
      <p><strong>Output formats.</strong> JPG, PNG and WebP. Browsers cannot write GIF, AVIF or TIFF, so those are input-only. WebP output depends on your browser, and the option is disabled with a reason if it is unavailable.</p>
      <p><strong>Trade-offs are shown per file.</strong> Converting to JPG fills transparency with white. Converting a lossless image (PNG, GIF, BMP, TIFF) to JPG or WebP is lossy, and you are told when that happens. SVG files are checked for scripts and external references and rejected if unsafe, then rasterized; they stop being vectors.</p>
      <p>AVIF and TIFF support depends on your browser and the file; unsupported or damaged files are reported per file. HEIC/HEIF is not supported.</p></>}>
    <ImageToolWorkbench mode="convert" />
  </ToolPage>
)
