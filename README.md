# Ausbildung.de Jobs Scraper

Extract comprehensive apprenticeship and training position data from Ausbildung.de, Germany's leading platform for vocational training opportunities. This scraper efficiently collects job listings with detailed information including company details, locations, training types, and complete job descriptions.

## 🚀 Key Features

- **Dual Extraction Method**: Prioritizes fast JSON API calls, automatically falls back to HTML parsing when needed
- **Smart Pagination**: Intelligently navigates through search results to collect the exact number of listings you need
- **Rich Data Collection**: Captures complete job information including descriptions, locations, federal states, and training types
- **Flexible Search Options**: Filter by keyword, location, and profession
- **Structured Data Support**: Leverages JSON-LD schema for accurate data extraction when available
- **Built-in Deduplication**: Automatically removes duplicate job listings
- **Proxy Support**: Includes proxy configuration for reliable, uninterrupted scraping

## 📋 Use Cases

- **Job Market Analysis**: Gather data for analyzing apprenticeship trends across different regions and industries
- **Career Guidance**: Aggregate training opportunities for students and career counselors
- **Recruitment Intelligence**: Monitor competitor hiring patterns and training programs
- **Research & Analytics**: Build datasets for labor market research and vocational education studies
- **Automated Job Boards**: Feed fresh apprenticeship listings into your own platforms or applications

## 🎯 Input Configuration

Configure the scraper with these parameters to match your specific needs:

### Search Parameters

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
<th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>keyword</code></td>
<td>String</td>
<td>Job title or search keyword (e.g., "Fachinformatiker", "Kaufmann")</td>
<td>-</td>
</tr>
<tr>
<td><code>location</code></td>
<td>String</td>
<td>City or location (e.g., "Berlin", "München")</td>
<td>-</td>
</tr>
<tr>
<td><code>beruf</code></td>
<td>String</td>
<td>Specific profession or job category</td>
<td>-</td>
</tr>
<tr>
<td><code>startUrl</code></td>
<td>String</td>
<td>Custom Ausbildung.de search URL (overrides other search parameters)</td>
<td>-</td>
</tr>
</tbody>
</table>

### Scraping Options

<table>
<thead>
<tr>
<th>Parameter</th>
<th>Type</th>
<th>Description</th>
<th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>results_wanted</code></td>
<td>Integer</td>
<td>Maximum number of job listings to collect</td>
<td>100</td>
</tr>
<tr>
<td><code>max_pages</code></td>
<td>Integer</td>
<td>Maximum number of pages to process (safety limit)</td>
<td>50</td>
</tr>
<tr>
<td><code>collectDetails</code></td>
<td>Boolean</td>
<td>Visit detail pages to extract full job descriptions</td>
<td>true</td>
</tr>
<tr>
<td><code>proxyConfiguration</code></td>
<td>Object</td>
<td>Proxy settings for reliable scraping</td>
<td>Residential proxies</td>
</tr>
</tbody>
</table>

### Example Input

```json
{
  "keyword": "Fachinformatiker",
  "location": "Berlin",
  "results_wanted": 50,
  "max_pages": 10,
  "collectDetails": true
}
```

## 📤 Output Format

Each scraped job listing contains the following fields:

<table>
<thead>
<tr>
<th>Field</th>
<th>Type</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>title</code></td>
<td>String</td>
<td>Job position title</td>
</tr>
<tr>
<td><code>company</code></td>
<td>String</td>
<td>Company or employer name</td>
</tr>
<tr>
<td><code>location</code></td>
<td>String</td>
<td>Job location (city)</td>
</tr>
<tr>
<td><code>bundesland</code></td>
<td>String</td>
<td>German federal state</td>
</tr>
<tr>
<td><code>beruf</code></td>
<td>String</td>
<td>Profession or job category</td>
</tr>
<tr>
<td><code>ausbildungsart</code></td>
<td>String</td>
<td>Type of training/apprenticeship</td>
</tr>
<tr>
<td><code>start_date</code></td>
<td>String</td>
<td>Training start date</td>
</tr>
<tr>
<td><code>date_posted</code></td>
<td>String</td>
<td>Date the job was posted</td>
</tr>
<tr>
<td><code>description_html</code></td>
<td>String</td>
<td>Full job description (HTML format)</td>
</tr>
<tr>
<td><code>description_text</code></td>
<td>String</td>
<td>Plain text version of job description</td>
</tr>
<tr>
<td><code>salary</code></td>
<td>String</td>
<td>Salary information (if available)</td>
</tr>
<tr>
<td><code>job_type</code></td>
<td>String</td>
<td>Employment type</td>
</tr>
<tr>
<td><code>url</code></td>
<td>String</td>
<td>Direct link to job posting</td>
</tr>
</tbody>
</table>

### Example Output

```json
{
  "title": "Ausbildung zum Fachinformatiker für Anwendungsentwicklung (m/w/d)",
  "company": "TechCorp GmbH",
  "location": "Berlin",
  "bundesland": "Berlin",
  "beruf": "Fachinformatiker/in - Anwendungsentwicklung",
  "ausbildungsart": "Duale Ausbildung",
  "start_date": "01.08.2025",
  "date_posted": "2024-12-01",
  "description_html": "<p>Wir suchen motivierte Auszubildende...</p>",
  "description_text": "Wir suchen motivierte Auszubildende...",
  "salary": "1000-1200 EUR",
  "job_type": "Ausbildung",
  "url": "https://www.ausbildung.de/stellen/..."
}
```

## 💡 How It Works

1. **Input Processing**: The scraper reads your search parameters and constructs appropriate search queries
2. **JSON API Extraction**: Uses JSON API for maximum speed and reliability
3. **HTML Fallback**: Automatically switches to HTML parsing if API is unavailable or you provide custom URLs
4. **Smart Extraction**: Uses JSON-LD structured data when available, falls back to CSS selectors
5. **Detail Collection**: Optionally visits each job detail page to extract complete information
6. **Data Validation**: Cleans and validates all extracted data before saving
7. **Deduplication**: Ensures no duplicate job listings in your final dataset

## 🔧 Best Practices

- **Start Small**: Test with `results_wanted: 10` before running large-scale extractions
- **Use Proxies**: Enable proxy configuration for reliable, uninterrupted scraping
- **Specific Searches**: More specific keywords yield better, more relevant results
- **Monitor Limits**: Set appropriate `max_pages` to control runtime and costs
- **Detail Mode**: Disable `collectDetails` if you only need basic listing information

## ⚙️ Technical Details

- Built with Crawlee for robust crawling and data extraction
- Uses JSON API for efficient data extraction with HTML fallback capability
- Implements intelligent retry logic and error handling
- Uses residential proxies for optimal reliability
- Processes data asynchronously for maximum performance

## 📊 Performance

- **Speed**: Processes 20-50 jobs per minute with API mode
- **Accuracy**: 95%+ data completeness with detail collection enabled
- **Reliability**: Built-in retry mechanisms handle temporary failures
- **Scalability**: Efficiently handles from 10 to 10,000+ job listings

## 🆘 Troubleshooting

**No results returned**: Verify your search parameters are correct and the website has matching listings

**Incomplete data**: Enable `collectDetails` to extract full job information from detail pages

**Rate limiting**: Enable proxy configuration and reduce `results_wanted` or add delays

**Outdated selectors**: The scraper automatically updates to handle website changes, but contact support if issues persist

## 📞 Support & Feedback

Found an issue or have a suggestion? We'd love to hear from you! Your feedback helps us improve this scraper for everyone.

---

Start extracting valuable apprenticeship data from Ausbildung.de today! Configure your parameters and run the scraper to build comprehensive datasets for your analysis, research, or application needs.
