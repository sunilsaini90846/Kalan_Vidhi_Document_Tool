# Linking the parent site (kalanvidhi.com) and Kalan Vidhi Doc Tool

The Doc Tool site (`https://doctool.kalanvidhi.com`) already links to the parent site from its footer and About page
(`BRAND.parentUrl` in `src/config/brand.ts`). The parent site lives outside this repository, so these changes have to be
made there.

## Changes needed on kalanvidhi.com

1. **Link to the product from the parent homepage.** Add a plain `<a href="https://doctool.kalanvidhi.com/">` in the
   site navigation, a products section or the footer, with descriptive anchor text, for example
   "Kalan Vidhi Doc Tool: free, private file compression and conversion". Avoid "click here" or "link".
   - Check the link is in the HTML the server returns, not only added by JavaScript. When this was written, the parent
     homepage HTML contained no mention of "doctool" (checked with `curl`); verify again after the change with
     `curl -s https://kalanvidhi.com/ | grep -i doctool`.
   - Optionally link a few popular tools directly (`/image-compressor`, `/pdf-compressor`, `/merge-pdf`).
2. **Describe the product accurately.** Say what it does and its limits, matching the tool pages: files are processed
   in the browser, and the PDF compressor recompresses embedded JPEG images rather than optimizing every PDF.
3. **Optional: publish the organization facts once, on the parent homepage.** The Doc Tool pages already name the
   publisher as `{ "@type": "Organization", "@id": "https://kalanvidhi.com/#organization", "name": "Kalan Vidhi",
   "url": "https://kalanvidhi.com/" }`. If the parent homepage adds JSON-LD, give it the same `@id` and add only facts
   that are true and visible on the site (logo URL, `sameAs` social profiles, contact point):

   ```html
   <script type="application/ld+json">
   { "@context": "https://schema.org", "@type": "Organization",
     "@id": "https://kalanvidhi.com/#organization", "name": "Kalan Vidhi", "url": "https://kalanvidhi.com/" }
   </script>
   ```

## What not to do

- Do not redirect `kalanvidhi.com` to the subdomain, or the reverse.
- Do not list `doctool.kalanvidhi.com` URLs in the parent site's `sitemap.xml`. A sitemap should list URLs of its own
  host; the Doc Tool site has its own sitemap at `https://doctool.kalanvidhi.com/sitemap.xml`.
- Do not set the Doc Tool pages' canonical URLs to the parent homepage. Each tool page is canonical for itself.

## Search Console

A verified **Domain property** for `kalanvidhi.com` covers both hosts. A **URL-prefix property** such as
`https://doctool.kalanvidhi.com/` covers only that prefix. Either can be used to submit the Doc Tool sitemap; check
which one you have under Settings, then Property settings.
