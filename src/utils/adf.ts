/**
 * Atlassian Document Format (ADF) utilities
 * Converts between plain text/markdown and ADF format
 */

export interface ADFDocument {
  version: 1;
  type: 'doc';
  content: ADFNode[];
}

export interface ADFNode {
  type: string;
  content?: ADFNode[];
  text?: string;
  attrs?: Record<string, any>;
  marks?: ADFMark[];
}

export interface ADFMark {
  type: string;
  attrs?: Record<string, any>;
}

export class ADFBuilder {
  /**
   * Convert plain text to ADF format with better code block handling
   */
  static textToADF(text: string): ADFDocument {
    if (!text) {
      return {
        version: 1,
        type: 'doc',
        content: [],
      };
    }

    const lines = text.split('\n');
    const content: ADFNode[] = [];
    let currentParagraph: ADFNode | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for code block markers
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          // Starting a code block
          inCodeBlock = true;
          codeBlockLanguage = line.slice(3).trim() || 'plain';
          codeBlockContent = [];
          
          // Close current paragraph if exists
          if (currentParagraph) {
            // Remove trailing newline
            if (currentParagraph.content!.length > 0) {
              const lastNode = currentParagraph.content![currentParagraph.content!.length - 1];
              if (lastNode.type === 'text' && lastNode.text === '\n') {
                currentParagraph.content!.pop();
              }
            }
            content.push(currentParagraph);
            currentParagraph = null;
          }
        } else {
          // Ending a code block
          inCodeBlock = false;
          content.push({
            type: 'codeBlock',
            attrs: {
              language: codeBlockLanguage,
            },
            content: codeBlockContent.length > 0 ? [{
              type: 'text',
              text: codeBlockContent.join('\n'),
            }] : [],
          });
          codeBlockContent = [];
          codeBlockLanguage = '';
        }
        continue;
      }

      if (inCodeBlock) {
        // Add line to code block
        codeBlockContent.push(line);
      } else if (line.trim() === '') {
        // Empty line - close current paragraph
        if (currentParagraph) {
          // Remove trailing newline
          if (currentParagraph.content!.length > 0) {
            const lastNode = currentParagraph.content![currentParagraph.content!.length - 1];
            if (lastNode.type === 'text' && lastNode.text === '\n') {
              currentParagraph.content!.pop();
            }
          }
          content.push(currentParagraph);
          currentParagraph = null;
        }
      } else {
        // Process line for special formatting
        const nodes = this.processLine(line);
        
        // Check if this is a special node (heading, list, etc.)
        if (nodes.length === 1 && ['heading', 'bulletList', 'orderedList'].includes(nodes[0].type)) {
          // Add special node directly
          if (currentParagraph) {
            // Remove trailing newline
            if (currentParagraph.content!.length > 0) {
              const lastNode = currentParagraph.content![currentParagraph.content!.length - 1];
              if (lastNode.type === 'text' && lastNode.text === '\n') {
                currentParagraph.content!.pop();
              }
            }
            content.push(currentParagraph);
            currentParagraph = null;
          }
          content.push(nodes[0]);
        } else {
          // Add to paragraph
          if (!currentParagraph) {
            currentParagraph = {
              type: 'paragraph',
              content: [],
            };
          }
          
          currentParagraph.content!.push(...nodes);
          
          // Only add newline if not the last line
          if (i < lines.length - 1) {
            currentParagraph.content!.push({ type: 'text', text: '\n' });
          }
        }
      }
    }

    // Handle unclosed code block
    if (inCodeBlock && codeBlockContent.length > 0) {
      content.push({
        type: 'codeBlock',
        attrs: {
          language: codeBlockLanguage || 'plain',
        },
        content: [{
          type: 'text',
          text: codeBlockContent.join('\n'),
        }],
      });
    }

    // Add remaining paragraph
    if (currentParagraph) {
      // Remove trailing newline
      if (currentParagraph.content!.length > 0) {
        const lastNode = currentParagraph.content![currentParagraph.content!.length - 1];
        if (lastNode.type === 'text' && lastNode.text === '\n') {
          currentParagraph.content!.pop();
        }
      }
      content.push(currentParagraph);
    }

    return {
      version: 1,
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
    };
  }

  /**
   * Process a line for special formatting (headings, lists, inline code, etc.)
   */
  private static processLine(line: string): ADFNode[] {
    const nodes: ADFNode[] = [];

    // Check for headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      return [{
        type: 'heading',
        attrs: {
          level: headingMatch[1].length,
        },
        content: [{
          type: 'text',
          text: headingMatch[2],
        }],
      }];
    }

    // Check for bullet points
    if (line.match(/^[\*\-]\s+/)) {
      return [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: line.replace(/^[\*\-]\s+/, ''),
            }],
          }],
        }],
      }];
    }

    // Check for numbered lists
    if (line.match(/^\d+\.\s+/)) {
      return [{
        type: 'orderedList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: line.replace(/^\d+\.\s+/, ''),
            }],
          }],
        }],
      }];
    }

    // Process inline formatting (code, bold, italic)
    let processedLine = line;
    let lastIndex = 0;
    
    // Process inline code first
    const codeMatches = Array.from(processedLine.matchAll(/`([^`]+)`/g));
    
    for (const match of codeMatches) {
      if (match.index! > lastIndex) {
        // Add text before code
        const textBefore = processedLine.slice(lastIndex, match.index);
        if (textBefore) {
          nodes.push(...this.processInlineFormatting(textBefore));
        }
      }
      
      // Add code
      nodes.push({
        type: 'text',
        text: match[1],
        marks: [{ type: 'code' }],
      });
      
      lastIndex = match.index! + match[0].length;
    }
    
    // Process remaining text
    if (lastIndex < processedLine.length) {
      const remainingText = processedLine.slice(lastIndex);
      nodes.push(...this.processInlineFormatting(remainingText));
    }

    return nodes.length > 0 ? nodes : [{ type: 'text', text: line }];
  }

  /**
   * Process inline formatting (bold, italic)
   */
  private static processInlineFormatting(text: string): ADFNode[] {
    const nodes: ADFNode[] = [];
    
    // Simple regex for bold and italic
    // This is a simplified version - a full implementation would need proper parsing
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
    
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Bold
        nodes.push({
          type: 'text',
          text: part.slice(2, -2),
          marks: [{ type: 'strong' }],
        });
      } else if (part.startsWith('*') && part.endsWith('*')) {
        // Italic
        nodes.push({
          type: 'text',
          text: part.slice(1, -1),
          marks: [{ type: 'em' }],
        });
      } else if (part) {
        // Plain text
        nodes.push({
          type: 'text',
          text: part,
        });
      }
    }
    
    return nodes.length > 0 ? nodes : [{ type: 'text', text }];
  }

  /**
   * Convert ADF to plain text
   */
  static adfToText(adf: ADFDocument | any): string {
    if (!adf || !adf.content) {
      return '';
    }

    return this.nodesToText(adf.content);
  }

  private static nodesToText(nodes: ADFNode[]): string {
    let text = '';

    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
          if (node.content) {
            text += this.nodesToText(node.content);
          }
          text += '\n';
          break;

        case 'heading':
          if (node.content) {
            const level = node.attrs?.level || 1;
            text += '#'.repeat(level) + ' ' + this.nodesToText(node.content);
          }
          text += '\n';
          break;

        case 'bulletList':
        case 'orderedList':
          if (node.content) {
            for (const item of node.content) {
              text += '• ' + this.nodesToText(item.content || []).trim() + '\n';
            }
          }
          break;

        case 'listItem':
          if (node.content) {
            text += this.nodesToText(node.content);
          }
          break;

        case 'codeBlock':
          text += '```' + (node.attrs?.language || '') + '\n';
          if (node.content) {
            text += this.nodesToText(node.content);
          }
          text += '\n```\n';
          break;

        case 'text':
          let textContent = node.text || '';
          
          // Apply marks
          if (node.marks) {
            for (const mark of node.marks) {
              switch (mark.type) {
                case 'code':
                  textContent = '`' + textContent + '`';
                  break;
                case 'strong':
                  textContent = '**' + textContent + '**';
                  break;
                case 'em':
                  textContent = '*' + textContent + '*';
                  break;
              }
            }
          }
          
          text += textContent;
          break;

        case 'mention':
          text += '@' + (node.attrs?.text || node.attrs?.id || 'user');
          break;

        case 'hardBreak':
          text += '\n';
          break;

        default:
          // Recursively process unknown nodes
          if (node.content) {
            text += this.nodesToText(node.content);
          }
      }
    }

    return text;
  }

  /**
   * Create a mention node for a user
   */
  static createMention(accountId: string, displayName: string): ADFNode {
    return {
      type: 'mention',
      attrs: {
        id: accountId,
        text: displayName,
        userType: 'DEFAULT',
      },
    };
  }
}