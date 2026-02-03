/* Knowledge Foyer - Markdown Utilities */
/* Simple client-side markdown rendering for article preview */

class MarkdownRenderer {
    constructor() {
        // Simple markdown patterns
        this.patterns = [
            // Headers
            { pattern: /^# (.+)$/gm, replacement: '<h1>$1</h1>' },
            { pattern: /^## (.+)$/gm, replacement: '<h2>$1</h2>' },
            { pattern: /^### (.+)$/gm, replacement: '<h3>$1</h3>' },
            { pattern: /^#### (.+)$/gm, replacement: '<h4>$1</h4>' },
            { pattern: /^##### (.+)$/gm, replacement: '<h5>$1</h5>' },
            { pattern: /^###### (.+)$/gm, replacement: '<h6>$1</h6>' },

            // Bold and italic
            { pattern: /\*\*\*(.+?)\*\*\*/g, replacement: '<strong><em>$1</em></strong>' },
            { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' },
            { pattern: /\*(.+?)\*/g, replacement: '<em>$1</em>' },
            { pattern: /___(.+?)___/g, replacement: '<strong><em>$1</em></strong>' },
            { pattern: /__(.+?)__/g, replacement: '<strong>$1</strong>' },
            { pattern: /_(.+?)_/g, replacement: '<em>$1</em>' },

            // Code
            { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' },

            // Links
            { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2" target="_blank" rel="noopener">$1</a>' },

            // Images
            { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, replacement: '<img src="$2" alt="$1" />' },

            // Strikethrough
            { pattern: /~~(.+?)~~/g, replacement: '<del>$1</del>' }
        ];
    }

    render(markdown) {
        if (!markdown) return '';

        // Clean and normalize input
        let html = this.escapeHtml(markdown);

        // Process code blocks first (to protect them from other processing)
        html = this.processCodeBlocks(html);

        // Process blockquotes
        html = this.processBlockquotes(html);

        // Process lists
        html = this.processLists(html);

        // Apply inline patterns
        this.patterns.forEach(({ pattern, replacement }) => {
            html = html.replace(pattern, replacement);
        });

        // Process paragraphs (must be done after other processing)
        html = this.processParagraphs(html);

        // Process line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    processCodeBlocks(text) {
        // Process fenced code blocks (```)
        return text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language ? ` class="language-${language}"` : '';
            return `<pre><code${lang}>${code.trim()}</code></pre>`;
        });
    }

    processBlockquotes(text) {
        const lines = text.split('\n');
        const result = [];
        let inBlockquote = false;
        let blockquoteContent = [];

        lines.forEach(line => {
            if (line.startsWith('> ')) {
                if (!inBlockquote) {
                    inBlockquote = true;
                    blockquoteContent = [];
                }
                blockquoteContent.push(line.substring(2));
            } else {
                if (inBlockquote) {
                    result.push(`<blockquote>${blockquoteContent.join('<br>')}</blockquote>`);
                    inBlockquote = false;
                    blockquoteContent = [];
                }
                result.push(line);
            }
        });

        // Handle blockquote at end of text
        if (inBlockquote) {
            result.push(`<blockquote>${blockquoteContent.join('<br>')}</blockquote>`);
        }

        return result.join('\n');
    }

    processLists(text) {
        const lines = text.split('\n');
        const result = [];
        let inOrderedList = false;
        let inUnorderedList = false;

        lines.forEach(line => {
            const orderedMatch = line.match(/^(\d+)\.\s(.+)/);
            const unorderedMatch = line.match(/^[-*+]\s(.+)/);

            if (orderedMatch) {
                if (!inOrderedList) {
                    if (inUnorderedList) {
                        result.push('</ul>');
                        inUnorderedList = false;
                    }
                    result.push('<ol>');
                    inOrderedList = true;
                }
                result.push(`<li>${orderedMatch[2]}</li>`);
            } else if (unorderedMatch) {
                if (!inUnorderedList) {
                    if (inOrderedList) {
                        result.push('</ol>');
                        inOrderedList = false;
                    }
                    result.push('<ul>');
                    inUnorderedList = true;
                }
                result.push(`<li>${unorderedMatch[1]}</li>`);
            } else {
                if (inOrderedList) {
                    result.push('</ol>');
                    inOrderedList = false;
                }
                if (inUnorderedList) {
                    result.push('</ul>');
                    inUnorderedList = false;
                }
                result.push(line);
            }
        });

        // Close any open lists
        if (inOrderedList) result.push('</ol>');
        if (inUnorderedList) result.push('</ul>');

        return result.join('\n');
    }

    processParagraphs(text) {
        // Split by double newlines to create paragraphs
        const paragraphs = text.split('\n\n').filter(p => p.trim());

        return paragraphs.map(paragraph => {
            const trimmed = paragraph.trim();

            // Skip if it's already a block-level element
            if (trimmed.startsWith('<h') ||
                trimmed.startsWith('<blockquote') ||
                trimmed.startsWith('<pre') ||
                trimmed.startsWith('<ul') ||
                trimmed.startsWith('<ol') ||
                trimmed.startsWith('<li')) {
                return trimmed;
            }

            // Wrap in paragraph tags
            return `<p>${trimmed}</p>`;
        }).join('');
    }

    // Extract word count from markdown
    getWordCount(markdown) {
        if (!markdown) return 0;

        // Remove markdown syntax and count words
        const plainText = markdown
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]+`/g, '') // Remove inline code
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with text
            .replace(/[#*_~`\[\]()]/g, '') // Remove markdown characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        if (!plainText) return 0;

        return plainText.split(' ').filter(word => word.length > 0).length;
    }

    // Extract reading time estimate
    getReadingTime(markdown) {
        const wordCount = this.getWordCount(markdown);
        const wordsPerMinute = 200; // Average reading speed
        const minutes = Math.ceil(wordCount / wordsPerMinute);
        return minutes;
    }

    // Extract headings for table of contents
    extractHeadings(markdown) {
        const headings = [];
        const lines = markdown.split('\n');

        lines.forEach(line => {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const id = this.generateId(text);

                headings.push({
                    level,
                    text,
                    id
                });
            }
        });

        return headings;
    }

    generateId(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Remove multiple consecutive hyphens
            .trim();
    }

    // Render with heading IDs for linking
    renderWithIds(markdown) {
        let html = this.render(markdown);

        // Add IDs to headings
        html = html.replace(/<h([1-6])>([^<]+)<\/h[1-6]>/g, (match, level, text) => {
            const id = this.generateId(text);
            return `<h${level} id="${id}">${text}</h${level}>`;
        });

        return html;
    }

    // Create a table of contents
    generateTableOfContents(markdown) {
        const headings = this.extractHeadings(markdown);

        if (headings.length === 0) {
            return '';
        }

        let toc = '<div class="table-of-contents"><h3>Table of Contents</h3><ul>';

        headings.forEach(heading => {
            const indent = '  '.repeat(heading.level - 1);
            toc += `${indent}<li><a href="#${heading.id}">${heading.text}</a></li>`;
        });

        toc += '</ul></div>';
        return toc;
    }
}

// Export for use in other modules
window.MarkdownRenderer = MarkdownRenderer;