export interface ScannedData {
  companyName: string;
  jobTitle: string;
  description: string;
  url: string;
}

export function scanPage(): ScannedData {
  const url = window.location.href;
  
  // Heuristics to find Company Name
  // Common patterns: Schema.org, meta tags, h1, specific classes
  let companyName = '';
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map(el => {
      try {
        return JSON.parse(el.textContent || '{}');
      } catch {
        return null;
      }
    })
    .find(json => json && (json['@type'] === 'JobPosting' || json['@type'] === 'Organization'));

  if (jsonLd) {
    if (jsonLd.hiringOrganization && jsonLd.hiringOrganization.name) {
      companyName = jsonLd.hiringOrganization.name;
    } else if (jsonLd.name) { // sometimes Organization name
       companyName = jsonLd.name;
    }
  }

  if (!companyName && ogSiteName) {
    companyName = ogSiteName;
  }

  // Fallback to title
  if (!companyName) {
    const title = document.title;
    if (title.includes(' at ')) {
      companyName = title.split(' at ')[1].split('|')[0].trim();
    } else if (title.includes(' - ')) {
      companyName = title.split(' - ')[1].trim(); // Often "Job Title - Company"
    }
  }

  // Heuristics for Job Title
  let jobTitle = '';
  if (jsonLd && jsonLd.title) {
    jobTitle = jsonLd.title;
  }
  
  if (!jobTitle) {
    const h1 = document.querySelector('h1');
    if (h1) {
      jobTitle = h1.innerText.trim();
    }
  }

  // Heuristics for Description (this is hard, taking main text)
  let description = '';
  if (jsonLd && jsonLd.description) {
     const tempDiv = document.createElement('div');
     tempDiv.innerHTML = jsonLd.description;
     description = tempDiv.innerText; // Strip HTML
  }

  if (!description) {
      // Try to find the largest block of text
      // Or just get body text but truncate
      description = document.body.innerText.slice(0, 5000); // Limit context window
  }

  return {
    companyName: companyName || 'Unknown Company',
    jobTitle: jobTitle || 'Unknown Position',
    description: description.substring(0, 8000), // Ensure we don't blow up context too much
    url
  };
}
