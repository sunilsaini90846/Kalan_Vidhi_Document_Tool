import { ToolPage } from '@/components/common/ToolPage'
import { ImageToolWorkbench } from './ImageToolWorkbench'

export const ImageCompressorPage = () => (
  <ToolPage title="Image Compressor" description="Compress JPG, PNG and WebP images in your browser. Single files or whole batches, with a before and after view."
    about={<>
      <p>Pick a preset (Low Size, Balanced or High Quality) or set the quality yourself. Dimensions are kept unless you opt in to resizing.</p>
      <p>Results show the real output size. If re-encoding cannot make an image smaller, the original is kept and we say so. PNG is lossless, so quality settings do not shrink it; resizing or converting to WebP does.</p>
      <p>Processing happens locally in your browser; images are not uploaded.</p></>}>
    <ImageToolWorkbench mode="compress" />
  </ToolPage>
)
export const ImageResizerPage = () => (
  <ToolPage title="Image Resizer" description="Resize images by maximum width and height while keeping the aspect ratio."
    about={<><p>Images are only made smaller unless you explicitly allow enlarging. Resized files are re-encoded in their original format.</p></>}>
    <ImageToolWorkbench mode="resize" />
  </ToolPage>
)
export const ImageConverterPage = () => (
  <ToolPage title="Image Converter" description="Convert images between JPG, PNG and WebP locally in your browser."
    about={<><p>Transparency is flattened onto white when converting to JPG. Whether WebP export is available depends on your browser; an error is shown if not.</p></>}>
    <ImageToolWorkbench mode="convert" />
  </ToolPage>
)
