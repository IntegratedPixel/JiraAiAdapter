/**
 * JQL sanitizer to prevent injection attacks
 */

export class JQLSanitizer {
  /**
   * Escape special characters in JQL string values
   * According to Jira docs, these need escaping: " ' \
   */
  static escapeValue(value: string): string {
    if (!value) return value;
    
    // Escape backslashes first (to avoid double-escaping)
    let escaped = value.replace(/\\/g, '\\\\');
    
    // Escape quotes
    escaped = escaped.replace(/"/g, '\\"');
    escaped = escaped.replace(/'/g, "\\'");
    
    return escaped;
  }

  /**
   * Sanitize and quote a field value for JQL
   */
  static sanitizeFieldValue(value: string): string {
    const escaped = this.escapeValue(value);
    return `"${escaped}"`;
  }

  /**
   * Sanitize project key (alphanumeric only)
   */
  static sanitizeProjectKey(key: string): string {
    // Project keys should only contain alphanumeric characters and hyphens
    return key.replace(/[^a-zA-Z0-9-]/g, '');
  }

  /**
   * Validate and sanitize a complete JQL query
   * This is a basic validation - Jira will do the final validation
   */
  static validateJQL(jql: string): string {
    // Remove any comment-like patterns that could be used for injection
    let sanitized = jql.replace(/--.*$/gm, ''); // SQL-style comments
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, ''); // C-style comments
    
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /;\s*DELETE/i,
      /;\s*DROP/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /UNION\s+SELECT/i,
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sanitized)) {
        throw new Error('Invalid JQL query: suspicious pattern detected');
      }
    }
    
    return sanitized;
  }

  /**
   * Build a safe JQL condition
   */
  static buildCondition(field: string, operator: string, value: string): string {
    const allowedOperators = ['=', '!=', '>', '<', '>=', '<=', '~', '!~', 'in', 'not in', 'is', 'is not'];
    
    if (!allowedOperators.includes(operator.toLowerCase())) {
      throw new Error(`Invalid JQL operator: ${operator}`);
    }
    
    // Special handling for IS/IS NOT operators (used with EMPTY)
    if (operator.toLowerCase() === 'is' || operator.toLowerCase() === 'is not') {
      return `${field} ${operator} ${value}`;
    }
    
    // For other operators, quote the value
    return `${field} ${operator} ${this.sanitizeFieldValue(value)}`;
  }
}