import { describe, it, expect } from 'vitest';
import { ADFBuilder } from '../../../src/utils/adf.js';

describe('ADF Builder', () => {
  describe('textToADF', () => {
    it('should convert plain text to ADF', () => {
      const text = 'Hello World';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf).toBeDefined();
      expect(adf.type).toBe('doc');
      expect(adf.version).toBe(1);
      expect(adf.content).toHaveLength(1);
      expect(adf.content[0].type).toBe('paragraph');
      expect(adf.content[0].content[0].text).toBe('Hello World');
    });

    it('should handle multiple lines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content).toHaveLength(3);
      expect(adf.content[0].content[0].text).toBe('Line 1');
      expect(adf.content[1].content[0].text).toBe('Line 2');
      expect(adf.content[2].content[0].text).toBe('Line 3');
    });

    it('should handle code blocks', () => {
      const text = '```\nconst x = 1;\nconsole.log(x);\n```';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].type).toBe('codeBlock');
      expect(adf.content[0].content[0].text).toContain('const x = 1;');
    });

    it('should handle inline code', () => {
      const text = 'Use `npm install` to install';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].content[1].type).toBe('text');
      expect(adf.content[0].content[1].marks).toBeDefined();
      expect(adf.content[0].content[1].marks[0].type).toBe('code');
    });

    it('should handle bold text', () => {
      const text = '**Important** information';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].content[0].marks).toBeDefined();
      expect(adf.content[0].content[0].marks[0].type).toBe('strong');
    });

    it('should handle italic text', () => {
      const text = '*Emphasized* text';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].content[0].marks).toBeDefined();
      expect(adf.content[0].content[0].marks[0].type).toBe('em');
    });

    it('should handle bullet lists', () => {
      const text = '- Item 1\n- Item 2\n- Item 3';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].type).toBe('bulletList');
      expect(adf.content[0].content).toHaveLength(3);
      expect(adf.content[0].content[0].type).toBe('listItem');
    });

    it('should handle numbered lists', () => {
      const text = '1. First\n2. Second\n3. Third';
      const adf = ADFBuilder.textToADF(text);
      
      expect(adf.content[0].type).toBe('orderedList');
      expect(adf.content[0].content).toHaveLength(3);
    });
  });

  describe('adfToText', () => {
    it('should convert ADF to plain text', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello World',
              },
            ],
          },
        ],
      };
      
      const text = ADFBuilder.adfToText(adf);
      expect(text).toBe('Hello World');
    });

    it('should handle multiple paragraphs', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph' }],
          },
        ],
      };
      
      const text = ADFBuilder.adfToText(adf);
      expect(text).toBe('First paragraph\n\nSecond paragraph');
    });

    it('should handle code blocks', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'codeBlock',
            content: [
              {
                type: 'text',
                text: 'const x = 1;\nconsole.log(x);',
              },
            ],
          },
        ],
      };
      
      const text = ADFBuilder.adfToText(adf);
      expect(text).toContain('const x = 1;');
      expect(text).toContain('console.log(x);');
    });

    it('should handle lists', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item 1' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Item 2' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      
      const text = ADFBuilder.adfToText(adf);
      expect(text).toContain('• Item 1');
      expect(text).toContain('• Item 2');
    });

    it('should handle empty ADF', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [],
      };
      
      const text = ADFBuilder.adfToText(adf);
      expect(text).toBe('');
    });

    it('should handle null or undefined', () => {
      expect(ADFBuilder.adfToText(null as any)).toBe('');
      expect(ADFBuilder.adfToText(undefined as any)).toBe('');
    });
  });

  describe('createMention', () => {
    it('should create a mention node', () => {
      const mention = ADFBuilder.createMention('user123', 'John Doe');
      
      expect(mention.type).toBe('mention');
      expect(mention.attrs.id).toBe('user123');
      expect(mention.attrs.text).toBe('@John Doe');
    });
  });

  describe('createLink', () => {
    it('should create a link mark', () => {
      const link = ADFBuilder.createLink('https://example.com');
      
      expect(link.type).toBe('link');
      expect(link.attrs.href).toBe('https://example.com');
    });

    it('should include title if provided', () => {
      const link = ADFBuilder.createLink('https://example.com', 'Example Site');
      
      expect(link.attrs.title).toBe('Example Site');
    });
  });
});