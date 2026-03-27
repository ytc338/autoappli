export interface ScannedData {
  companyName: string;
  jobTitle: string;
  description: string;
  url: string;
}

function detectActiveContext(): ParentNode {
  // Look for common modal patterns
  const selectors = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.modal',
    '.popup',
    '.dialog',
    '[class*="modal"]',
    '[class*="popup"]'
  ];

  // Find all matching elements and return the one with the highest z-index or the last one (assumed to be on top)
  const candidates = Array.from(document.querySelectorAll(selectors.join(',')))
    .filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });

  if (candidates.length > 0) {
    // Sort by checking which one is deepest or has highest z-index ideally,
    // but often the last one in DOM closest to body end is the active one.
    // Let's take the last visible one as a heuristic.
    return candidates[candidates.length - 1];
  }

  return document;
}

/**
 * Try to extract company name from inside a modal/overlay context.
 * Overlays on job boards often contain the company name in labeled elements
 * that the global page metadata does not reflect.
 */
function extractCompanyFromContext(context: ParentNode): string {
  // 1. Look for elements whose class or data attributes hint at "company" / "employer" / "organization"
  const companySelectors = [
    '[class*="company" i]',
    '[class*="employer" i]',
    '[class*="organization" i]',
    '[data-testid*="company" i]',
    '[data-testid*="employer" i]',
    '[aria-label*="company" i]',
  ];
  for (const selector of companySelectors) {
    try {
      const els = context.querySelectorAll(selector);
      for (const el of els) {
        const text = (el as HTMLElement).innerText?.trim();
        // Sanity: reject if too long (probably a container) or empty
        if (text && text.length > 1 && text.length < 100) {
          return text;
        }
      }
    } catch {
      // Selector may be unsupported in some browsers, skip
    }
  }

  // 2. Look for labeled text patterns like "Company: Acme Corp"
  const textContent = (context as HTMLElement).innerText || '';
  const labelPatterns = [
    /(?:company|employer|organization|hiring\s+company)\s*[:\-–]\s*(.+)/i,
  ];
  for (const pattern of labelPatterns) {
    const match = textContent.match(pattern);
    if (match && match[1]) {
      // Take first line only
      const name = match[1].split('\n')[0].trim();
      if (name.length > 1 && name.length < 100) {
        return name;
      }
    }
  }

  return '';
}

export function scanPage(): ScannedData {
  const url = window.location.href;
  const context = detectActiveContext();
  const isModal = context !== document;

  // --- Company Name ---
  // Priority: JSON-LD hiringOrganization > modal context clues > og:site_name > title parsing
  let companyName = '';

  // 1. JSON-LD (most reliable when present — specifically hiringOrganization)
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map(el => {
      try {
        return JSON.parse(el.textContent || '{}');
      } catch {
        return null;
      }
    })
    .find(json => json && (json['@type'] === 'JobPosting' || json['@type'] === 'Organization'));

  if (jsonLd?.hiringOrganization?.name) {
    companyName = jsonLd.hiringOrganization.name;
  }

  // 2. If inside a modal/overlay, look inside it for company name clues
  //    (the page-level metadata often describes the job board, not the hiring company)
  if (!companyName && isModal) {
    companyName = extractCompanyFromContext(context);
  }

  // 3. Also try the full page context (useful even without modal)
  if (!companyName) {
    companyName = extractCompanyFromContext(document);
  }

  // 4. og:site_name — useful on direct company career pages, but misleading on job boards
  if (!companyName) {
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (ogSiteName) {
      companyName = ogSiteName;
    }
  }

  // 5. JSON-LD Organization name (less specific than hiringOrganization)
  if (!companyName && jsonLd?.name) {
    companyName = jsonLd.name;
  }

  // 6. Fallback to document title parsing
  if (!companyName) {
    const title = document.title;
    if (title.includes(' at ')) {
      companyName = title.split(' at ')[1].split('|')[0].trim();
    } else if (title.includes(' - ')) {
      companyName = title.split(' - ')[1].trim();
    }
  }

  // Heuristics for Job Title
  let jobTitle = '';
  if (jsonLd && jsonLd.title) {
    jobTitle = jsonLd.title;
  }
  
  if (!jobTitle) {
    // Search within context first
    const h1 = context.querySelector('h1');
    if (h1) {
        jobTitle = (h1 as HTMLElement).innerText.trim();
    } else if (isModal) {
        // If inside modal and no h1, try h2
        const h2 = context.querySelector('h2');
        if (h2) {
            jobTitle = (h2 as HTMLElement).innerText.trim();
        }
    } else {
        // Fallback to global H1
         const h1 = document.querySelector('h1');
         if (h1) {
             jobTitle = h1.innerText.trim();
         }
    }
  }

  // Heuristics for Description
  let description = '';
  if (jsonLd && jsonLd.description) {
     const tempDiv = document.createElement('div');
     tempDiv.innerHTML = jsonLd.description;
     description = tempDiv.innerText; // Strip HTML
  }

  if (!description) {
      // Prioritize text within the modal context
      const textContainer = isModal ? (context as HTMLElement) : document.body;
      description = textContainer.innerText.slice(0, 5000); 
  }

  return {
    companyName: companyName || 'Unknown Company',
    jobTitle: jobTitle || 'Unknown Position',
    description: description.substring(0, 8000),
    url
  };
}
