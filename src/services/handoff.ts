/** Hands files picked on the homepage to the tool page that opens next (File objects cannot travel through the URL). */
let pending: File[] = []
export const setPendingFiles = (files: File[]) => { pending = files }
export function takePendingFiles(): File[] { const f = pending; pending = []; return f }
