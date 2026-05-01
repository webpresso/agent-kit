#!/usr/bin/env node
#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require3() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js
var require_constants = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/constants.js"(exports, module) {
    "use strict";
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DEFAULT_MAX_EXTGLOB_RECURSION = 0;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var SEP = "/";
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR,
      SEP
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
      SEP: "\\"
    };
    var POSIX_REGEX_SOURCE = {
      __proto__: null,
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module.exports = {
      DEFAULT_MAX_EXTGLOB_RECURSION,
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        __proto__: null,
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js
var require_utils = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/utils.js"(exports) {
    "use strict";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants();
    exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports.hasRegexChars = (str2) => REGEX_SPECIAL_CHARS.test(str2);
    exports.isRegexChar = (str2) => str2.length === 1 && exports.hasRegexChars(str2);
    exports.escapeRegex = (str2) => str2.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports.toPosixSlashes = (str2) => str2.replace(REGEX_BACKSLASH, "/");
    exports.isWindows = () => {
      if (typeof navigator !== "undefined" && navigator.platform) {
        const platform = navigator.platform.toLowerCase();
        return platform === "win32" || platform === "windows";
      }
      if (typeof process !== "undefined" && process.platform) {
        return process.platform === "win32";
      }
      return false;
    };
    exports.removeBackslashes = (str2) => {
      return str2.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
    exports.basename = (path3, { windows } = {}) => {
      const segs = path3.split(windows ? /[\\/]/ : "/");
      const last = segs[segs.length - 1];
      if (last === "") {
        return segs[segs.length - 2];
      }
      return last;
    };
  }
});

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/scan.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    var {
      CHAR_ASTERISK: CHAR_ASTERISK2,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA: CHAR_COMMA2,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET: CHAR_LEFT_SQUARE_BRACKET2,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET: CHAR_RIGHT_SQUARE_BRACKET2
      /* ] */
    } = require_constants();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str2 = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str2.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str2.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA2) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK2 || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  code = advance();
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES) {
                  isGlob = token.isGlob = true;
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK2) {
          if (prev === CHAR_ASTERISK2) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET2) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET2) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_LEFT_PARENTHESES) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str2;
      let prefix = "";
      let glob2 = "";
      if (start > 0) {
        prefix = str2.slice(0, start);
        str2 = str2.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str2.slice(0, lastIndex);
        glob2 = str2.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob2 = str2;
      } else {
        base = str2;
      }
      if (base && base !== "" && base !== "/" && base !== str2) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob2) glob2 = utils.removeBackslashes(glob2);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob: glob2,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (idx !== 0 || value !== "") {
            parts.push(value);
          }
          prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
          const value = input.slice(prevIndex + 1);
          parts.push(value);
          if (opts.tokens) {
            tokens[tokens.length - 1].value = value;
            depth(tokens[tokens.length - 1]);
            state.maxDepth += tokens[tokens.length - 1].depth;
          }
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module.exports = scan;
  }
});

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/parse.js
var require_parse = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/parse.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var utils = require_utils();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type2, char) => {
      return `Missing ${type2}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var splitTopLevel = (input) => {
      const parts = [];
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let value = "";
      let escaped = false;
      for (const ch of input) {
        if (escaped === true) {
          value += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          value += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          value += ch;
          continue;
        }
        if (quote === 0) {
          if (ch === "[") {
            bracket++;
          } else if (ch === "]" && bracket > 0) {
            bracket--;
          } else if (bracket === 0) {
            if (ch === "(") {
              paren++;
            } else if (ch === ")" && paren > 0) {
              paren--;
            } else if (ch === "|" && paren === 0) {
              parts.push(value);
              value = "";
              continue;
            }
          }
        }
        value += ch;
      }
      parts.push(value);
      return parts;
    };
    var isPlainBranch = (branch) => {
      let escaped = false;
      for (const ch of branch) {
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (/[?*+@!()[\]{}]/.test(ch)) {
          return false;
        }
      }
      return true;
    };
    var normalizeSimpleBranch = (branch) => {
      let value = branch.trim();
      let changed = true;
      while (changed === true) {
        changed = false;
        if (/^@\([^\\()[\]{}|]+\)$/.test(value)) {
          value = value.slice(2, -1);
          changed = true;
        }
      }
      if (!isPlainBranch(value)) {
        return;
      }
      return value.replace(/\\(.)/g, "$1");
    };
    var hasRepeatedCharPrefixOverlap = (branches) => {
      const values = branches.map(normalizeSimpleBranch).filter(Boolean);
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          const a = values[i];
          const b = values[j];
          const char = a[0];
          if (!char || a !== char.repeat(a.length) || b !== char.repeat(b.length)) {
            continue;
          }
          if (a === b || a.startsWith(b) || b.startsWith(a)) {
            return true;
          }
        }
      }
      return false;
    };
    var parseRepeatedExtglob = (pattern, requireEnd = true) => {
      if (pattern[0] !== "+" && pattern[0] !== "*" || pattern[1] !== "(") {
        return;
      }
      let bracket = 0;
      let paren = 0;
      let quote = 0;
      let escaped = false;
      for (let i = 1; i < pattern.length; i++) {
        const ch = pattern[i];
        if (escaped === true) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          quote = quote === 1 ? 0 : 1;
          continue;
        }
        if (quote === 1) {
          continue;
        }
        if (ch === "[") {
          bracket++;
          continue;
        }
        if (ch === "]" && bracket > 0) {
          bracket--;
          continue;
        }
        if (bracket > 0) {
          continue;
        }
        if (ch === "(") {
          paren++;
          continue;
        }
        if (ch === ")") {
          paren--;
          if (paren === 0) {
            if (requireEnd === true && i !== pattern.length - 1) {
              return;
            }
            return {
              type: pattern[0],
              body: pattern.slice(2, i),
              end: i
            };
          }
        }
      }
    };
    var getStarExtglobSequenceOutput = (pattern) => {
      let index = 0;
      const chars = [];
      while (index < pattern.length) {
        const match = parseRepeatedExtglob(pattern.slice(index), false);
        if (!match || match.type !== "*") {
          return;
        }
        const branches = splitTopLevel(match.body).map((branch2) => branch2.trim());
        if (branches.length !== 1) {
          return;
        }
        const branch = normalizeSimpleBranch(branches[0]);
        if (!branch || branch.length !== 1) {
          return;
        }
        chars.push(branch);
        index += match.end + 1;
      }
      if (chars.length < 1) {
        return;
      }
      const source = chars.length === 1 ? utils.escapeRegex(chars[0]) : `[${chars.map((ch) => utils.escapeRegex(ch)).join("")}]`;
      return `${source}*`;
    };
    var repeatedExtglobRecursion = (pattern) => {
      let depth = 0;
      let value = pattern.trim();
      let match = parseRepeatedExtglob(value);
      while (match) {
        depth++;
        value = match.body.trim();
        match = parseRepeatedExtglob(value);
      }
      return depth;
    };
    var analyzeRepeatedExtglob = (body, options) => {
      if (options.maxExtglobRecursion === false) {
        return { risky: false };
      }
      const max = typeof options.maxExtglobRecursion === "number" ? options.maxExtglobRecursion : constants.DEFAULT_MAX_EXTGLOB_RECURSION;
      const branches = splitTopLevel(body).map((branch) => branch.trim());
      if (branches.length > 1) {
        if (branches.some((branch) => branch === "") || branches.some((branch) => /^[*?]+$/.test(branch)) || hasRepeatedCharPrefixOverlap(branches)) {
          return { risky: true };
        }
      }
      for (const branch of branches) {
        const safeOutput = getStarExtglobSequenceOutput(branch);
        if (safeOutput) {
          return { risky: true, safeOutput };
        }
        if (repeatedExtglobRecursion(branch) > max) {
          return { risky: true };
        }
      }
      return { risky: false };
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const PLATFORM_CHARS = constants.globChars(opts.windows);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type2) => {
        state[type2]++;
        stack.push(type2);
      };
      const decrement = (type2) => {
        state[type2]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.output = (prev.output || prev.value) + tok.value;
          prev.value += tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type2, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        token.startIndex = state.index;
        token.tokensIndex = tokens.length;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type: type2, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        const literal = input.slice(token.startIndex, state.index + 1);
        const body = input.slice(token.startIndex + 2, state.index);
        const analysis = analyzeRepeatedExtglob(body, opts);
        if ((token.type === "plus" || token.type === "star") && analysis.risky) {
          const safeOutput = analysis.safeOutput ? (token.output ? "" : ONE_CHAR) + (opts.capture ? `(${analysis.safeOutput})` : analysis.safeOutput) : void 0;
          const open = tokens[token.tokensIndex];
          open.type = "text";
          open.value = literal;
          open.output = safeOutput || utils.escapeRegex(literal);
          for (let i = token.tokensIndex + 1; i < tokens.length; i++) {
            tokens[i].value = "";
            tokens[i].output = "";
            delete tokens[i].suffix;
          }
          state.output = token.output + open.output;
          state.backtrack = true;
          push({ type: "paren", extglob: true, value, output: "" });
          decrement("parens");
          return;
        }
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix2 = POSIX_REGEX_SOURCE[rest2];
                if (posix2) {
                  prev.value = pre + posix2;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(opts.windows);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str2) => {
        switch (str2) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str2);
            if (!match) return;
            const source2 = create(match[1]);
            if (!source2) return;
            return source2 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source = create(output);
      if (source && opts.strictSlashes !== true) {
        source += `${SLASH_LITERAL}?`;
      }
      return source;
    };
    module.exports = parse;
  }
});

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/lib/picomatch.js"(exports, module) {
    "use strict";
    var scan = require_scan();
    var parse = require_parse();
    var utils = require_utils();
    var constants = require_constants();
    var isObject2 = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch2 = (glob2, options, returnState = false) => {
      if (Array.isArray(glob2)) {
        const fns = glob2.map((input) => picomatch2(input, options, returnState));
        const arrayMatcher = (str2) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str2);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject2(glob2) && glob2.tokens && glob2.input;
      if (glob2 === "" || typeof glob2 !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix2 = opts.windows;
      const regex = isState ? picomatch2.compileRe(glob2, options) : picomatch2.makeRe(glob2, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch2(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch2.test(input, regex, options, { glob: glob2, posix: posix2 });
        const result = { glob: glob2, state, regex, posix: posix2, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result);
        }
        if (isMatch === false) {
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result);
          }
          result.isMatch = false;
          return returnObject ? result : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result);
        }
        return returnObject ? result : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch2.test = (input, regex, options, { glob: glob2, posix: posix2 } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix2 ? utils.toPosixSlashes : null);
      let match = input === glob2;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob2;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch2.matchBase(input, regex, options, posix2);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch2.matchBase = (input, glob2, options) => {
      const regex = glob2 instanceof RegExp ? glob2 : picomatch2.makeRe(glob2, options);
      return regex.test(utils.basename(input));
    };
    picomatch2.isMatch = (str2, patterns, options) => picomatch2(patterns, options)(str2);
    picomatch2.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch2.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch2.scan = (input, options) => scan(input, options);
    picomatch2.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source = `^(?!${source}).*$`;
      }
      const regex = picomatch2.toRegex(source, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch2.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch2.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch2.toRegex = (source, options) => {
      try {
        const opts = options || {};
        return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch2.constants = constants;
    module.exports = picomatch2;
  }
});

// ../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "../agent-kit/node_modules/.pnpm/picomatch@4.0.4/node_modules/picomatch/index.js"(exports, module) {
    "use strict";
    var pico = require_picomatch();
    var utils = require_utils();
    function picomatch2(glob2, options, returnState = false) {
      if (options && (options.windows === null || options.windows === void 0)) {
        options = { ...options, windows: utils.isWindows() };
      }
      return pico(glob2, options, returnState);
    }
    Object.assign(picomatch2, pico);
    module.exports = picomatch2;
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/unicode.js
var require_unicode = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/unicode.js"(exports, module) {
    var Uni = module.exports;
    module.exports.isWhiteSpace = function isWhiteSpace(x) {
      return x === " " || x === "\xA0" || x === "\uFEFF" || x >= "	" && x <= "\r" || x === "\u1680" || x >= "\u2000" && x <= "\u200A" || x === "\u2028" || x === "\u2029" || x === "\u202F" || x === "\u205F" || x === "\u3000";
    };
    module.exports.isWhiteSpaceJSON = function isWhiteSpaceJSON(x) {
      return x === " " || x === "	" || x === "\n" || x === "\r";
    };
    module.exports.isLineTerminator = function isLineTerminator(x) {
      return x === "\n" || x === "\r" || x === "\u2028" || x === "\u2029";
    };
    module.exports.isLineTerminatorJSON = function isLineTerminatorJSON(x) {
      return x === "\n" || x === "\r";
    };
    module.exports.isIdentifierStart = function isIdentifierStart(x) {
      return x === "$" || x === "_" || x >= "A" && x <= "Z" || x >= "a" && x <= "z" || x >= "\x80" && Uni.NonAsciiIdentifierStart.test(x);
    };
    module.exports.isIdentifierPart = function isIdentifierPart(x) {
      return x === "$" || x === "_" || x >= "A" && x <= "Z" || x >= "a" && x <= "z" || x >= "0" && x <= "9" || x >= "\x80" && Uni.NonAsciiIdentifierPart.test(x);
    };
    module.exports.NonAsciiIdentifierStart = /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
    module.exports.NonAsciiIdentifierPart = /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0\u08A2-\u08AC\u08E4-\u08FE\u0900-\u0963\u0966-\u096F\u0971-\u0977\u0979-\u097F\u0981-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C82\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191C\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1D00-\u1DE6\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA697\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7B\uAA80-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE26\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/;
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/parse.js
var require_parse2 = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/parse.js"(exports, module) {
    var Uni = require_unicode();
    function isHexDigit(x) {
      return x >= "0" && x <= "9" || x >= "A" && x <= "F" || x >= "a" && x <= "f";
    }
    function isOctDigit(x) {
      return x >= "0" && x <= "7";
    }
    function isDecDigit(x) {
      return x >= "0" && x <= "9";
    }
    var unescapeMap = {
      "'": "'",
      '"': '"',
      "\\": "\\",
      "b": "\b",
      "f": "\f",
      "n": "\n",
      "r": "\r",
      "t": "	",
      "v": "\v",
      "/": "/"
    };
    function formatError2(input, msg, position, lineno, column, json5) {
      var result = msg + " at " + (lineno + 1) + ":" + (column + 1), tmppos = position - column - 1, srcline = "", underline = "";
      var isLineTerminator = json5 ? Uni.isLineTerminator : Uni.isLineTerminatorJSON;
      if (tmppos < position - 70) {
        tmppos = position - 70;
      }
      while (1) {
        var chr = input[++tmppos];
        if (isLineTerminator(chr) || tmppos === input.length) {
          if (position >= tmppos) {
            underline += "^";
          }
          break;
        }
        srcline += chr;
        if (position === tmppos) {
          underline += "^";
        } else if (position > tmppos) {
          underline += input[tmppos] === "	" ? "	" : " ";
        }
        if (srcline.length > 78) break;
      }
      return result + "\n" + srcline + "\n" + underline;
    }
    function parse(input, options) {
      var json5 = false;
      var cjson = false;
      if (options.legacy || options.mode === "json") {
      } else if (options.mode === "cjson") {
        cjson = true;
      } else if (options.mode === "json5") {
        json5 = true;
      } else {
        json5 = true;
      }
      var isLineTerminator = json5 ? Uni.isLineTerminator : Uni.isLineTerminatorJSON;
      var isWhiteSpace = json5 ? Uni.isWhiteSpace : Uni.isWhiteSpaceJSON;
      var length = input.length, lineno = 0, linestart = 0, position = 0, stack = [];
      var tokenStart = function() {
      };
      var tokenEnd = function(v) {
        return v;
      };
      if (options._tokenize) {
        ;
        (function() {
          var start = null;
          tokenStart = function() {
            if (start !== null) throw Error("internal error, token overlap");
            start = position;
          };
          tokenEnd = function(v, type2) {
            if (start != position) {
              var hash = {
                raw: input.substr(start, position - start),
                type: type2,
                stack: stack.slice(0)
              };
              if (v !== void 0) hash.value = v;
              options._tokenize.call(null, hash);
            }
            start = null;
            return v;
          };
        })();
      }
      function fail(msg) {
        var column = position - linestart;
        if (!msg) {
          if (position < length) {
            var token = "'" + JSON.stringify(input[position]).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, '"') + "'";
            if (!msg) msg = "Unexpected token " + token;
          } else {
            if (!msg) msg = "Unexpected end of input";
          }
        }
        var error = SyntaxError(formatError2(input, msg, position, lineno, column, json5));
        error.row = lineno + 1;
        error.column = column + 1;
        throw error;
      }
      function newline(chr) {
        if (chr === "\r" && input[position] === "\n") position++;
        linestart = position;
        lineno++;
      }
      function parseGeneric() {
        var result;
        while (position < length) {
          tokenStart();
          var chr = input[position++];
          if (chr === '"' || chr === "'" && json5) {
            return tokenEnd(parseString(chr), "literal");
          } else if (chr === "{") {
            tokenEnd(void 0, "separator");
            return parseObject();
          } else if (chr === "[") {
            tokenEnd(void 0, "separator");
            return parseArray();
          } else if (chr === "-" || chr === "." || isDecDigit(chr) || json5 && (chr === "+" || chr === "I" || chr === "N")) {
            return tokenEnd(parseNumber(), "literal");
          } else if (chr === "n") {
            parseKeyword("null");
            return tokenEnd(null, "literal");
          } else if (chr === "t") {
            parseKeyword("true");
            return tokenEnd(true, "literal");
          } else if (chr === "f") {
            parseKeyword("false");
            return tokenEnd(false, "literal");
          } else {
            position--;
            return tokenEnd(void 0);
          }
        }
      }
      function parseKey() {
        var result;
        while (position < length) {
          tokenStart();
          var chr = input[position++];
          if (chr === '"' || chr === "'" && json5) {
            return tokenEnd(parseString(chr), "key");
          } else if (chr === "{") {
            tokenEnd(void 0, "separator");
            return parseObject();
          } else if (chr === "[") {
            tokenEnd(void 0, "separator");
            return parseArray();
          } else if (chr === "." || isDecDigit(chr)) {
            return tokenEnd(parseNumber(true), "key");
          } else if (json5 && Uni.isIdentifierStart(chr) || chr === "\\" && input[position] === "u") {
            var rollback = position - 1;
            var result = parseIdentifier();
            if (result === void 0) {
              position = rollback;
              return tokenEnd(void 0);
            } else {
              return tokenEnd(result, "key");
            }
          } else {
            position--;
            return tokenEnd(void 0);
          }
        }
      }
      function skipWhiteSpace() {
        tokenStart();
        while (position < length) {
          var chr = input[position++];
          if (isLineTerminator(chr)) {
            position--;
            tokenEnd(void 0, "whitespace");
            tokenStart();
            position++;
            newline(chr);
            tokenEnd(void 0, "newline");
            tokenStart();
          } else if (isWhiteSpace(chr)) {
          } else if (chr === "/" && (json5 || cjson) && (input[position] === "/" || input[position] === "*")) {
            position--;
            tokenEnd(void 0, "whitespace");
            tokenStart();
            position++;
            skipComment(input[position++] === "*");
            tokenEnd(void 0, "comment");
            tokenStart();
          } else {
            position--;
            break;
          }
        }
        return tokenEnd(void 0, "whitespace");
      }
      function skipComment(multi) {
        while (position < length) {
          var chr = input[position++];
          if (isLineTerminator(chr)) {
            if (!multi) {
              position--;
              return;
            }
            newline(chr);
          } else if (chr === "*" && multi) {
            if (input[position] === "/") {
              position++;
              return;
            }
          } else {
          }
        }
        if (multi) {
          fail("Unclosed multiline comment");
        }
      }
      function parseKeyword(keyword) {
        var _pos = position;
        var len = keyword.length;
        for (var i = 1; i < len; i++) {
          if (position >= length || keyword[i] != input[position]) {
            position = _pos - 1;
            fail();
          }
          position++;
        }
      }
      function parseObject() {
        var result = options.null_prototype ? /* @__PURE__ */ Object.create(null) : {}, empty_object = {}, is_non_empty = false;
        while (position < length) {
          skipWhiteSpace();
          var item1 = parseKey();
          skipWhiteSpace();
          tokenStart();
          var chr = input[position++];
          tokenEnd(void 0, "separator");
          if (chr === "}" && item1 === void 0) {
            if (!json5 && is_non_empty) {
              position--;
              fail("Trailing comma in object");
            }
            return result;
          } else if (chr === ":" && item1 !== void 0) {
            skipWhiteSpace();
            stack.push(item1);
            var item2 = parseGeneric();
            stack.pop();
            if (item2 === void 0) fail("No value found for key " + item1);
            if (typeof item1 !== "string") {
              if (!json5 || typeof item1 !== "number") {
                fail("Wrong key type: " + item1);
              }
            }
            if ((item1 in empty_object || empty_object[item1] != null) && options.reserved_keys !== "replace") {
              if (options.reserved_keys === "throw") {
                fail("Reserved key: " + item1);
              } else {
              }
            } else {
              if (typeof options.reviver === "function") {
                item2 = options.reviver.call(null, item1, item2);
              }
              if (item2 !== void 0) {
                is_non_empty = true;
                Object.defineProperty(result, item1, {
                  value: item2,
                  enumerable: true,
                  configurable: true,
                  writable: true
                });
              }
            }
            skipWhiteSpace();
            tokenStart();
            var chr = input[position++];
            tokenEnd(void 0, "separator");
            if (chr === ",") {
              continue;
            } else if (chr === "}") {
              return result;
            } else {
              fail();
            }
          } else {
            position--;
            fail();
          }
        }
        fail();
      }
      function parseArray() {
        var result = [];
        while (position < length) {
          skipWhiteSpace();
          stack.push(result.length);
          var item = parseGeneric();
          stack.pop();
          skipWhiteSpace();
          tokenStart();
          var chr = input[position++];
          tokenEnd(void 0, "separator");
          if (item !== void 0) {
            if (typeof options.reviver === "function") {
              item = options.reviver.call(null, String(result.length), item);
            }
            if (item === void 0) {
              result.length++;
              item = true;
            } else {
              result.push(item);
            }
          }
          if (chr === ",") {
            if (item === void 0) {
              fail("Elisions are not supported");
            }
          } else if (chr === "]") {
            if (!json5 && item === void 0 && result.length) {
              position--;
              fail("Trailing comma in array");
            }
            return result;
          } else {
            position--;
            fail();
          }
        }
      }
      function parseNumber() {
        position--;
        var start = position, chr = input[position++], t;
        var to_num = function(is_octal2) {
          var str2 = input.substr(start, position - start);
          if (is_octal2) {
            var result = parseInt(str2.replace(/^0o?/, ""), 8);
          } else {
            var result = Number(str2);
          }
          if (Number.isNaN(result)) {
            position--;
            fail('Bad numeric literal - "' + input.substr(start, position - start + 1) + '"');
          } else if (!json5 && !str2.match(/^-?(0|[1-9][0-9]*)(\.[0-9]+)?(e[+-]?[0-9]+)?$/i)) {
            position--;
            fail('Non-json numeric literal - "' + input.substr(start, position - start + 1) + '"');
          } else {
            return result;
          }
        };
        if (chr === "-" || chr === "+" && json5) chr = input[position++];
        if (chr === "N" && json5) {
          parseKeyword("NaN");
          return NaN;
        }
        if (chr === "I" && json5) {
          parseKeyword("Infinity");
          return to_num();
        }
        if (chr >= "1" && chr <= "9") {
          while (position < length && isDecDigit(input[position])) position++;
          chr = input[position++];
        }
        if (chr === "0") {
          chr = input[position++];
          var is_octal = chr === "o" || chr === "O" || isOctDigit(chr);
          var is_hex = chr === "x" || chr === "X";
          if (json5 && (is_octal || is_hex)) {
            while (position < length && (is_hex ? isHexDigit : isOctDigit)(input[position])) position++;
            var sign = 1;
            if (input[start] === "-") {
              sign = -1;
              start++;
            } else if (input[start] === "+") {
              start++;
            }
            return sign * to_num(is_octal);
          }
        }
        if (chr === ".") {
          while (position < length && isDecDigit(input[position])) position++;
          chr = input[position++];
        }
        if (chr === "e" || chr === "E") {
          chr = input[position++];
          if (chr === "-" || chr === "+") position++;
          while (position < length && isDecDigit(input[position])) position++;
          chr = input[position++];
        }
        position--;
        return to_num();
      }
      function parseIdentifier() {
        position--;
        var result = "";
        while (position < length) {
          var chr = input[position++];
          if (chr === "\\" && input[position] === "u" && isHexDigit(input[position + 1]) && isHexDigit(input[position + 2]) && isHexDigit(input[position + 3]) && isHexDigit(input[position + 4])) {
            chr = String.fromCharCode(parseInt(input.substr(position + 1, 4), 16));
            position += 5;
          }
          if (result.length) {
            if (Uni.isIdentifierPart(chr)) {
              result += chr;
            } else {
              position--;
              return result;
            }
          } else {
            if (Uni.isIdentifierStart(chr)) {
              result += chr;
            } else {
              return void 0;
            }
          }
        }
        fail();
      }
      function parseString(endChar) {
        var result = "";
        while (position < length) {
          var chr = input[position++];
          if (chr === endChar) {
            return result;
          } else if (chr === "\\") {
            if (position >= length) fail();
            chr = input[position++];
            if (unescapeMap[chr] && (json5 || chr != "v" && chr != "'")) {
              result += unescapeMap[chr];
            } else if (json5 && isLineTerminator(chr)) {
              newline(chr);
            } else if (chr === "u" || chr === "x" && json5) {
              var off = chr === "u" ? 4 : 2;
              for (var i = 0; i < off; i++) {
                if (position >= length) fail();
                if (!isHexDigit(input[position])) fail("Bad escape sequence");
                position++;
              }
              result += String.fromCharCode(parseInt(input.substr(position - off, off), 16));
            } else if (json5 && isOctDigit(chr)) {
              if (chr < "4" && isOctDigit(input[position]) && isOctDigit(input[position + 1])) {
                var digits = 3;
              } else if (isOctDigit(input[position])) {
                var digits = 2;
              } else {
                var digits = 1;
              }
              position += digits - 1;
              result += String.fromCharCode(parseInt(input.substr(position - digits, digits), 8));
            } else if (json5) {
              result += chr;
            } else {
              position--;
              fail();
            }
          } else if (isLineTerminator(chr)) {
            fail();
          } else {
            if (!json5 && chr.charCodeAt(0) < 32) {
              position--;
              fail("Unexpected control character");
            }
            result += chr;
          }
        }
        fail();
      }
      skipWhiteSpace();
      var return_value = parseGeneric();
      if (return_value !== void 0 || position < length) {
        skipWhiteSpace();
        if (position >= length) {
          if (typeof options.reviver === "function") {
            return_value = options.reviver.call(null, "", return_value);
          }
          return return_value;
        } else {
          fail();
        }
      } else {
        if (position) {
          fail("No data, only a whitespace");
        } else {
          fail("No data, empty input");
        }
      }
    }
    module.exports.parse = function parseJSON(input, options) {
      if (typeof options === "function") {
        options = {
          reviver: options
        };
      }
      if (input === void 0) {
        return void 0;
      }
      if (typeof input !== "string") input = String(input);
      if (options == null) options = {};
      if (options.reserved_keys == null) options.reserved_keys = "ignore";
      if (options.reserved_keys === "throw" || options.reserved_keys === "ignore") {
        if (options.null_prototype == null) {
          options.null_prototype = true;
        }
      }
      try {
        return parse(input, options);
      } catch (err) {
        if (err instanceof SyntaxError && err.row != null && err.column != null) {
          var old_err = err;
          err = SyntaxError(old_err.message);
          err.column = old_err.column;
          err.row = old_err.row;
        }
        throw err;
      }
    };
    module.exports.tokenize = function tokenizeJSON(input, options) {
      if (options == null) options = {};
      options._tokenize = function(smth) {
        if (options._addstack) smth.stack.unshift.apply(smth.stack, options._addstack);
        tokens.push(smth);
      };
      var tokens = [];
      tokens.data = module.exports.parse(input, options);
      return tokens;
    };
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/stringify.js
var require_stringify = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/stringify.js"(exports, module) {
    var Uni = require_unicode();
    if (!(function f() {
    }).name) {
      Object.defineProperty((function() {
      }).constructor.prototype, "name", {
        get: function() {
          var name = this.toString().match(/^\s*function\s*(\S*)\s*\(/)[1];
          Object.defineProperty(this, "name", { value: name });
          return name;
        }
      });
    }
    var special_chars = {
      0: "\\0",
      // this is not an octal literal
      8: "\\b",
      9: "\\t",
      10: "\\n",
      11: "\\v",
      12: "\\f",
      13: "\\r",
      92: "\\\\"
    };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var escapable = /[\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/;
    function _stringify(object, options, recursiveLvl, currentKey) {
      var json5 = options.mode === "json5" || !options.mode;
      function indent(str3, add) {
        var prefix = options._prefix ? options._prefix : "";
        if (!options.indent) return prefix + str3;
        var result = "";
        var count = recursiveLvl + (add || 0);
        for (var i = 0; i < count; i++) result += options.indent;
        return prefix + result + str3 + (add ? "\n" : "");
      }
      function _stringify_key(key) {
        if (options.quote_keys) return _stringify_str(key);
        if (String(Number(key)) == key && key[0] != "-") return key;
        if (key == "") return _stringify_str(key);
        var result = "";
        for (var i = 0; i < key.length; i++) {
          if (i > 0) {
            if (!Uni.isIdentifierPart(key[i]))
              return _stringify_str(key);
          } else {
            if (!Uni.isIdentifierStart(key[i]))
              return _stringify_str(key);
          }
          var chr = key.charCodeAt(i);
          if (options.ascii) {
            if (chr < 128) {
              result += key[i];
            } else {
              result += "\\u" + ("0000" + chr.toString(16)).slice(-4);
            }
          } else {
            if (escapable.exec(key[i])) {
              result += "\\u" + ("0000" + chr.toString(16)).slice(-4);
            } else {
              result += key[i];
            }
          }
        }
        return result;
      }
      function _stringify_str(key) {
        var quote = options.quote;
        var quoteChr = quote.charCodeAt(0);
        var result = "";
        for (var i = 0; i < key.length; i++) {
          var chr = key.charCodeAt(i);
          if (chr < 16) {
            if (chr === 0 && json5) {
              result += "\\0";
            } else if (chr >= 8 && chr <= 13 && (json5 || chr !== 11)) {
              result += special_chars[chr];
            } else if (json5) {
              result += "\\x0" + chr.toString(16);
            } else {
              result += "\\u000" + chr.toString(16);
            }
          } else if (chr < 32) {
            if (json5) {
              result += "\\x" + chr.toString(16);
            } else {
              result += "\\u00" + chr.toString(16);
            }
          } else if (chr >= 32 && chr < 128) {
            if (chr === 47 && i && key[i - 1] === "<") {
              result += "\\" + key[i];
            } else if (chr === 92) {
              result += "\\\\";
            } else if (chr === quoteChr) {
              result += "\\" + quote;
            } else {
              result += key[i];
            }
          } else if (options.ascii || Uni.isLineTerminator(key[i]) || escapable.exec(key[i])) {
            if (chr < 256) {
              if (json5) {
                result += "\\x" + chr.toString(16);
              } else {
                result += "\\u00" + chr.toString(16);
              }
            } else if (chr < 4096) {
              result += "\\u0" + chr.toString(16);
            } else if (chr < 65536) {
              result += "\\u" + chr.toString(16);
            } else {
              throw Error("weird codepoint");
            }
          } else {
            result += key[i];
          }
        }
        return quote + result + quote;
      }
      function _stringify_object() {
        if (object === null) return "null";
        var result = [], len = 0, braces;
        if (Array.isArray(object)) {
          braces = "[]";
          for (var i = 0; i < object.length; i++) {
            var s = _stringify(object[i], options, recursiveLvl + 1, String(i));
            if (s === void 0) s = "null";
            len += s.length + 2;
            result.push(s + ",");
          }
        } else {
          braces = "{}";
          var fn = function(key) {
            var t = _stringify(object[key], options, recursiveLvl + 1, key);
            if (t !== void 0) {
              t = _stringify_key(key) + ":" + (options.indent ? " " : "") + t + ",";
              len += t.length + 1;
              result.push(t);
            }
          };
          if (Array.isArray(options.replacer)) {
            for (var i = 0; i < options.replacer.length; i++)
              if (hasOwnProperty.call(object, options.replacer[i]))
                fn(options.replacer[i]);
          } else {
            var keys = Object.keys(object);
            if (options.sort_keys)
              keys = keys.sort(typeof options.sort_keys === "function" ? options.sort_keys : void 0);
            keys.forEach(fn);
          }
        }
        len -= 2;
        if (options.indent && (len > options._splitMax - recursiveLvl * options.indent.length || len > options._splitMin)) {
          if (options.no_trailing_comma && result.length) {
            result[result.length - 1] = result[result.length - 1].substring(0, result[result.length - 1].length - 1);
          }
          var innerStuff = result.map(function(x) {
            return indent(x, 1);
          }).join("");
          return braces[0] + (options.indent ? "\n" : "") + innerStuff + indent(braces[1]);
        } else {
          if (result.length) {
            result[result.length - 1] = result[result.length - 1].substring(0, result[result.length - 1].length - 1);
          }
          var innerStuff = result.join(options.indent ? " " : "");
          return braces[0] + innerStuff + braces[1];
        }
      }
      function _stringify_nonobject(object2) {
        if (typeof options.replacer === "function") {
          object2 = options.replacer.call(null, currentKey, object2);
        }
        switch (typeof object2) {
          case "string":
            return _stringify_str(object2);
          case "number":
            if (object2 === 0 && 1 / object2 < 0) {
              return "-0";
            }
            if (!json5 && !Number.isFinite(object2)) {
              return "null";
            }
            return object2.toString();
          case "boolean":
            return object2.toString();
          case "undefined":
            return void 0;
          case "function":
          //        return custom_type()
          default:
            return JSON.stringify(object2);
        }
      }
      if (options._stringify_key) {
        return _stringify_key(object);
      }
      if (typeof object === "object") {
        if (object === null) return "null";
        var str2;
        if (typeof (str2 = object.toJSON5) === "function" && options.mode !== "json") {
          object = str2.call(object, currentKey);
        } else if (typeof (str2 = object.toJSON) === "function") {
          object = str2.call(object, currentKey);
        }
        if (object === null) return "null";
        if (typeof object !== "object") return _stringify_nonobject(object);
        if (object.constructor === Number || object.constructor === Boolean || object.constructor === String) {
          object = object.valueOf();
          return _stringify_nonobject(object);
        } else if (object.constructor === Date) {
          return _stringify_nonobject(object.toISOString());
        } else {
          if (typeof options.replacer === "function") {
            object = options.replacer.call(null, currentKey, object);
            if (typeof object !== "object") return _stringify_nonobject(object);
          }
          return _stringify_object(object);
        }
      } else {
        return _stringify_nonobject(object);
      }
    }
    module.exports.stringify = function stringifyJSON(object, options, _space) {
      if (typeof options === "function" || Array.isArray(options)) {
        options = {
          replacer: options
        };
      } else if (typeof options === "object" && options !== null) {
      } else {
        options = {};
      }
      if (_space != null) options.indent = _space;
      if (options.indent == null) options.indent = "	";
      if (options.quote == null) options.quote = "'";
      if (options.ascii == null) options.ascii = false;
      if (options.mode == null) options.mode = "json5";
      if (options.mode === "json" || options.mode === "cjson") {
        options.quote = '"';
        options.no_trailing_comma = true;
        options.quote_keys = true;
      }
      if (typeof options.indent === "object") {
        if (options.indent.constructor === Number || options.indent.constructor === Boolean || options.indent.constructor === String)
          options.indent = options.indent.valueOf();
      }
      if (typeof options.indent === "number") {
        if (options.indent >= 0) {
          options.indent = Array(Math.min(~~options.indent, 10) + 1).join(" ");
        } else {
          options.indent = false;
        }
      } else if (typeof options.indent === "string") {
        options.indent = options.indent.substr(0, 10);
      }
      if (options._splitMin == null) options._splitMin = 50;
      if (options._splitMax == null) options._splitMax = 70;
      return _stringify(object, options, 0, "");
    };
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/analyze.js
var require_analyze = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/analyze.js"(exports, module) {
    var tokenize = require_parse2().tokenize;
    module.exports.analyze = function analyzeJSON(input, options) {
      if (options == null) options = {};
      if (!Array.isArray(input)) {
        input = tokenize(input, options);
      }
      var result = {
        has_whitespace: false,
        has_comments: false,
        has_newlines: false,
        has_trailing_comma: false,
        indent: "",
        newline: "\n",
        quote: '"',
        quote_keys: true
      };
      var stats = {
        indent: {},
        newline: {},
        quote: {}
      };
      for (var i = 0; i < input.length; i++) {
        if (input[i].type === "newline") {
          if (input[i + 1] && input[i + 1].type === "whitespace") {
            if (input[i + 1].raw[0] === "	") {
              stats.indent["	"] = (stats.indent["	"] || 0) + 1;
            }
            if (input[i + 1].raw.match(/^\x20+$/)) {
              var ws_len = input[i + 1].raw.length;
              var indent_len = input[i + 1].stack.length + 1;
              if (ws_len % indent_len === 0) {
                var t = Array(ws_len / indent_len + 1).join(" ");
                stats.indent[t] = (stats.indent[t] || 0) + 1;
              }
            }
          }
          stats.newline[input[i].raw] = (stats.newline[input[i].raw] || 0) + 1;
        }
        if (input[i].type === "newline") {
          result.has_newlines = true;
        }
        if (input[i].type === "whitespace") {
          result.has_whitespace = true;
        }
        if (input[i].type === "comment") {
          result.has_comments = true;
        }
        if (input[i].type === "key") {
          if (input[i].raw[0] !== '"' && input[i].raw[0] !== "'") result.quote_keys = false;
        }
        if (input[i].type === "key" || input[i].type === "literal") {
          if (input[i].raw[0] === '"' || input[i].raw[0] === "'") {
            stats.quote[input[i].raw[0]] = (stats.quote[input[i].raw[0]] || 0) + 1;
          }
        }
        if (input[i].type === "separator" && input[i].raw === ",") {
          for (var j = i + 1; j < input.length; j++) {
            if (input[j].type === "literal" || input[j].type === "key") break;
            if (input[j].type === "separator") result.has_trailing_comma = true;
          }
        }
      }
      for (var k in stats) {
        if (Object.keys(stats[k]).length) {
          result[k] = Object.keys(stats[k]).reduce(function(a, b) {
            return stats[k][a] > stats[k][b] ? a : b;
          });
        }
      }
      return result;
    };
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/document.js
var require_document = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/document.js"(exports, module) {
    var assert = __require("assert");
    var tokenize = require_parse2().tokenize;
    var stringify = require_stringify().stringify;
    var analyze = require_analyze().analyze;
    function isObject2(x) {
      return typeof x === "object" && x !== null;
    }
    function value_to_tokenlist(value, stack, options, is_key, indent) {
      options = Object.create(options);
      options._stringify_key = !!is_key;
      if (indent) {
        options._prefix = indent.prefix.map(function(x) {
          return x.raw;
        }).join("");
      }
      if (options._splitMin == null) options._splitMin = 0;
      if (options._splitMax == null) options._splitMax = 0;
      var stringified = stringify(value, options);
      if (is_key) {
        return [{ raw: stringified, type: "key", stack, value }];
      }
      options._addstack = stack;
      var result = tokenize(stringified, {
        _addstack: stack
      });
      result.data = null;
      return result;
    }
    function arg_to_path(path3) {
      if (typeof path3 === "number") path3 = String(path3);
      if (path3 === "") path3 = [];
      if (typeof path3 === "string") path3 = path3.split(".");
      if (!Array.isArray(path3)) throw Error("Invalid path type, string or array expected");
      return path3;
    }
    function find_element_in_tokenlist(element, lvl, tokens, begin, end) {
      while (tokens[begin].stack[lvl] != element) {
        if (begin++ >= end) return false;
      }
      while (tokens[end].stack[lvl] != element) {
        if (end-- < begin) return false;
      }
      return [begin, end];
    }
    function is_whitespace(token_type) {
      return token_type === "whitespace" || token_type === "newline" || token_type === "comment";
    }
    function find_first_non_ws_token(tokens, begin, end) {
      while (is_whitespace(tokens[begin].type)) {
        if (begin++ >= end) return false;
      }
      return begin;
    }
    function find_last_non_ws_token(tokens, begin, end) {
      while (is_whitespace(tokens[end].type)) {
        if (end-- < begin) return false;
      }
      return end;
    }
    function detect_indent_style(tokens, is_array, begin, end, level) {
      var result = {
        sep1: [],
        sep2: [],
        suffix: [],
        prefix: [],
        newline: []
      };
      if (tokens[end].type === "separator" && tokens[end].stack.length !== level + 1 && tokens[end].raw !== ",") {
        return result;
      }
      if (tokens[end].type === "separator")
        end = find_last_non_ws_token(tokens, begin, end - 1);
      if (end === false) return result;
      while (tokens[end].stack.length > level) end--;
      if (!is_array) {
        while (is_whitespace(tokens[end].type)) {
          if (end < begin) return result;
          if (tokens[end].type === "whitespace") {
            result.sep2.unshift(tokens[end]);
          } else {
            return result;
          }
          end--;
        }
        assert.equal(tokens[end].type, "separator");
        assert.equal(tokens[end].raw, ":");
        while (is_whitespace(tokens[--end].type)) {
          if (end < begin) return result;
          if (tokens[end].type === "whitespace") {
            result.sep1.unshift(tokens[end]);
          } else {
            return result;
          }
        }
        assert.equal(tokens[end].type, "key");
        end--;
      }
      while (is_whitespace(tokens[end].type)) {
        if (end < begin) return result;
        if (tokens[end].type === "whitespace") {
          result.prefix.unshift(tokens[end]);
        } else if (tokens[end].type === "newline") {
          result.newline.unshift(tokens[end]);
          return result;
        } else {
          return result;
        }
        end--;
      }
      return result;
    }
    function Document(text, options) {
      var self = Object.create(Document.prototype);
      if (options == null) options = {};
      var tokens = self._tokens = tokenize(text, options);
      self._data = tokens.data;
      tokens.data = null;
      self._options = options;
      var stats = analyze(text, options);
      if (options.indent == null) {
        options.indent = stats.indent;
      }
      if (options.quote == null) {
        options.quote = stats.quote;
      }
      if (options.quote_keys == null) {
        options.quote_keys = stats.quote_keys;
      }
      if (options.no_trailing_comma == null) {
        options.no_trailing_comma = !stats.has_trailing_comma;
      }
      return self;
    }
    function check_if_can_be_placed(key, object, is_unset) {
      function error(add) {
        return Error("You can't " + (is_unset ? "unset" : "set") + " key '" + key + "'" + add);
      }
      if (!isObject2(object)) {
        throw error(" of an non-object");
      }
      if (Array.isArray(object)) {
        if (String(key).match(/^\d+$/)) {
          key = Number(String(key));
          if (object.length < key || is_unset && object.length === key) {
            throw error(", out of bounds");
          } else if (is_unset && object.length !== key + 1) {
            throw error(" in the middle of an array");
          } else {
            return true;
          }
        } else {
          throw error(" of an array");
        }
      } else {
        return true;
      }
    }
    Document.prototype.set = function(path3, value) {
      path3 = arg_to_path(path3);
      if (path3.length === 0) {
        if (value === void 0) throw Error("can't remove root document");
        this._data = value;
        var new_key = false;
      } else {
        var data = this._data;
        for (var i = 0; i < path3.length - 1; i++) {
          check_if_can_be_placed(path3[i], data, false);
          data = data[path3[i]];
        }
        if (i === path3.length - 1) {
          check_if_can_be_placed(path3[i], data, value === void 0);
        }
        var new_key = !(path3[i] in data);
        if (value === void 0) {
          if (Array.isArray(data)) {
            data.pop();
          } else {
            delete data[path3[i]];
          }
        } else {
          data[path3[i]] = value;
        }
      }
      if (!this._tokens.length)
        this._tokens = [{ raw: "", type: "literal", stack: [], value: void 0 }];
      var position = [
        find_first_non_ws_token(this._tokens, 0, this._tokens.length - 1),
        find_last_non_ws_token(this._tokens, 0, this._tokens.length - 1)
      ];
      for (var i = 0; i < path3.length - 1; i++) {
        position = find_element_in_tokenlist(path3[i], i, this._tokens, position[0], position[1]);
        if (position == false) throw Error("internal error, please report this");
      }
      if (path3.length === 0) {
        var newtokens = value_to_tokenlist(value, path3, this._options);
      } else if (!new_key) {
        var pos_old = position;
        position = find_element_in_tokenlist(path3[i], i, this._tokens, position[0], position[1]);
        if (value === void 0 && position !== false) {
          var newtokens = [];
          if (!Array.isArray(data)) {
            var pos2 = find_last_non_ws_token(this._tokens, pos_old[0], position[0] - 1);
            assert.equal(this._tokens[pos2].type, "separator");
            assert.equal(this._tokens[pos2].raw, ":");
            position[0] = pos2;
            var pos2 = find_last_non_ws_token(this._tokens, pos_old[0], position[0] - 1);
            assert.equal(this._tokens[pos2].type, "key");
            assert.equal(this._tokens[pos2].value, path3[path3.length - 1]);
            position[0] = pos2;
          }
          var pos2 = find_last_non_ws_token(this._tokens, pos_old[0], position[0] - 1);
          assert.equal(this._tokens[pos2].type, "separator");
          if (this._tokens[pos2].raw === ",") {
            position[0] = pos2;
          } else {
            pos2 = find_first_non_ws_token(this._tokens, position[1] + 1, pos_old[1]);
            assert.equal(this._tokens[pos2].type, "separator");
            if (this._tokens[pos2].raw === ",") {
              position[1] = pos2;
            }
          }
        } else {
          var indent = pos2 !== false ? detect_indent_style(this._tokens, Array.isArray(data), pos_old[0], position[1] - 1, i) : {};
          var newtokens = value_to_tokenlist(value, path3, this._options, false, indent);
        }
      } else {
        var path_1 = path3.slice(0, i);
        var pos2 = find_last_non_ws_token(this._tokens, position[0] + 1, position[1] - 1);
        assert(pos2 !== false);
        var indent = pos2 !== false ? detect_indent_style(this._tokens, Array.isArray(data), position[0] + 1, pos2, i) : {};
        var newtokens = value_to_tokenlist(value, path3, this._options, false, indent);
        var prefix = [];
        if (indent.newline && indent.newline.length)
          prefix = prefix.concat(indent.newline);
        if (indent.prefix && indent.prefix.length)
          prefix = prefix.concat(indent.prefix);
        if (!Array.isArray(data)) {
          prefix = prefix.concat(value_to_tokenlist(path3[path3.length - 1], path_1, this._options, true));
          if (indent.sep1 && indent.sep1.length)
            prefix = prefix.concat(indent.sep1);
          prefix.push({ raw: ":", type: "separator", stack: path_1 });
          if (indent.sep2 && indent.sep2.length)
            prefix = prefix.concat(indent.sep2);
        }
        newtokens.unshift.apply(newtokens, prefix);
        if (this._tokens[pos2].type === "separator" && this._tokens[pos2].stack.length === path3.length - 1) {
          if (this._tokens[pos2].raw === ",") {
            newtokens.push({ raw: ",", type: "separator", stack: path_1 });
          }
        } else {
          newtokens.unshift({ raw: ",", type: "separator", stack: path_1 });
        }
        if (indent.suffix && indent.suffix.length)
          newtokens.push.apply(newtokens, indent.suffix);
        assert.equal(this._tokens[position[1]].type, "separator");
        position[0] = pos2 + 1;
        position[1] = pos2;
      }
      newtokens.unshift(position[1] - position[0] + 1);
      newtokens.unshift(position[0]);
      this._tokens.splice.apply(this._tokens, newtokens);
      return this;
    };
    Document.prototype.unset = function(path3) {
      return this.set(path3, void 0);
    };
    Document.prototype.get = function(path3) {
      path3 = arg_to_path(path3);
      var data = this._data;
      for (var i = 0; i < path3.length; i++) {
        if (!isObject2(data)) return void 0;
        data = data[path3[i]];
      }
      return data;
    };
    Document.prototype.has = function(path3) {
      path3 = arg_to_path(path3);
      var data = this._data;
      for (var i = 0; i < path3.length; i++) {
        if (!isObject2(data)) return false;
        data = data[path3[i]];
      }
      return data !== void 0;
    };
    Document.prototype.update = function(value) {
      var self = this;
      change([], self._data, value);
      return self;
      function change(path3, old_data, new_data) {
        if (!isObject2(new_data) || !isObject2(old_data)) {
          if (new_data !== old_data)
            self.set(path3, new_data);
        } else if (Array.isArray(new_data) != Array.isArray(old_data)) {
          self.set(path3, new_data);
        } else if (Array.isArray(new_data)) {
          if (new_data.length > old_data.length) {
            for (var i = 0; i < new_data.length; i++) {
              path3.push(String(i));
              change(path3, old_data[i], new_data[i]);
              path3.pop();
            }
          } else {
            for (var i = old_data.length - 1; i >= 0; i--) {
              path3.push(String(i));
              change(path3, old_data[i], new_data[i]);
              path3.pop();
            }
          }
        } else {
          for (var i in new_data) {
            path3.push(String(i));
            change(path3, old_data[i], new_data[i]);
            path3.pop();
          }
          for (var i in old_data) {
            if (i in new_data) continue;
            path3.push(String(i));
            change(path3, old_data[i], new_data[i]);
            path3.pop();
          }
        }
      }
    };
    Document.prototype.toString = function() {
      return this._tokens.map(function(x) {
        return x.raw;
      }).join("");
    };
    module.exports.Document = Document;
    module.exports.update = function updateJSON(source, new_value, options) {
      return Document(source, options).update(new_value).toString();
    };
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/utils.js
var require_utils2 = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/lib/utils.js"(exports, module) {
    var FS = __require("fs");
    var jju2 = require_jju();
    module.exports.register = function() {
      var r = __require, e = "extensions";
      r[e][".json5"] = function(m, f) {
        m.exports = jju2.parse(FS.readFileSync(f, "utf8"));
      };
    };
    module.exports.patch_JSON_parse = function() {
      var _parse = JSON.parse;
      JSON.parse = function(text, rev) {
        try {
          return _parse(text, rev);
        } catch (err) {
          require_jju().parse(text, {
            mode: "json",
            legacy: true,
            reviver: rev,
            reserved_keys: "replace",
            null_prototype: false
          });
          throw err;
        }
      };
    };
    module.exports.middleware = function() {
      return function(req, res, next) {
        throw Error("this function is removed, use express-json5 instead");
      };
    };
  }
});

// ../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/index.js
var require_jju = __commonJS({
  "../agent-kit/node_modules/.pnpm/jju@1.4.0/node_modules/jju/index.js"(exports, module) {
    module.exports.__defineGetter__("parse", function() {
      return require_parse2().parse;
    });
    module.exports.__defineGetter__("stringify", function() {
      return require_stringify().stringify;
    });
    module.exports.__defineGetter__("tokenize", function() {
      return require_parse2().tokenize;
    });
    module.exports.__defineGetter__("update", function() {
      return require_document().update;
    });
    module.exports.__defineGetter__("analyze", function() {
      return require_analyze().analyze;
    });
    module.exports.__defineGetter__("utils", function() {
      return require_utils2();
    });
  }
});

// ../agent-kit/src/hooks/pretool-guard/index.ts
import { realpathSync as realpathSync3 } from "node:fs";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// ../agent-kit/src/hooks/pretool-guard/runner.ts
import { realpathSync as realpathSync2 } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// ../agent-kit/node_modules/.pnpm/@manypkg+tools@2.1.1/node_modules/@manypkg/tools/dist/manypkg-tools.js
import * as path from "node:path";
import path__default from "node:path";
import * as fs from "node:fs";
import fs__default from "node:fs";
import * as fsp from "node:fs/promises";
import fsp__default from "node:fs/promises";
import { F_OK } from "node:constants";

// ../agent-kit/node_modules/.pnpm/tinyglobby@0.2.16/node_modules/tinyglobby/dist/index.mjs
import { readdir, readdirSync, realpath, realpathSync, stat, statSync } from "fs";
import { isAbsolute, posix, resolve as resolve2 } from "path";
import { fileURLToPath } from "url";

// ../agent-kit/node_modules/.pnpm/fdir@6.5.0_picomatch@4.0.4/node_modules/fdir/dist/index.mjs
import { createRequire } from "module";
import { basename, dirname, normalize, relative, resolve, sep } from "path";
import * as nativeFs from "fs";
var __require2 = /* @__PURE__ */ createRequire(import.meta.url);
function cleanPath(path3) {
  let normalized = normalize(path3);
  if (normalized.length > 1 && normalized[normalized.length - 1] === sep) normalized = normalized.substring(0, normalized.length - 1);
  return normalized;
}
var SLASHES_REGEX = /[\\/]/g;
function convertSlashes(path3, separator) {
  return path3.replace(SLASHES_REGEX, separator);
}
var WINDOWS_ROOT_DIR_REGEX = /^[a-z]:[\\/]$/i;
function isRootDirectory(path3) {
  return path3 === "/" || WINDOWS_ROOT_DIR_REGEX.test(path3);
}
function normalizePath(path3, options) {
  const { resolvePaths, normalizePath: normalizePath$1, pathSeparator } = options;
  const pathNeedsCleaning = process.platform === "win32" && path3.includes("/") || path3.startsWith(".");
  if (resolvePaths) path3 = resolve(path3);
  if (normalizePath$1 || pathNeedsCleaning) path3 = cleanPath(path3);
  if (path3 === ".") return "";
  const needsSeperator = path3[path3.length - 1] !== pathSeparator;
  return convertSlashes(needsSeperator ? path3 + pathSeparator : path3, pathSeparator);
}
function joinPathWithBasePath(filename, directoryPath) {
  return directoryPath + filename;
}
function joinPathWithRelativePath(root, options) {
  return function(filename, directoryPath) {
    const sameRoot = directoryPath.startsWith(root);
    if (sameRoot) return directoryPath.slice(root.length) + filename;
    else return convertSlashes(relative(root, directoryPath), options.pathSeparator) + options.pathSeparator + filename;
  };
}
function joinPath(filename) {
  return filename;
}
function joinDirectoryPath(filename, directoryPath, separator) {
  return directoryPath + filename + separator;
}
function build$7(root, options) {
  const { relativePaths, includeBasePath } = options;
  return relativePaths && root ? joinPathWithRelativePath(root, options) : includeBasePath ? joinPathWithBasePath : joinPath;
}
function pushDirectoryWithRelativePath(root) {
  return function(directoryPath, paths) {
    paths.push(directoryPath.substring(root.length) || ".");
  };
}
function pushDirectoryFilterWithRelativePath(root) {
  return function(directoryPath, paths, filters) {
    const relativePath = directoryPath.substring(root.length) || ".";
    if (filters.every((filter) => filter(relativePath, true))) paths.push(relativePath);
  };
}
var pushDirectory = (directoryPath, paths) => {
  paths.push(directoryPath || ".");
};
var pushDirectoryFilter = (directoryPath, paths, filters) => {
  const path3 = directoryPath || ".";
  if (filters.every((filter) => filter(path3, true))) paths.push(path3);
};
var empty$2 = () => {
};
function build$6(root, options) {
  const { includeDirs, filters, relativePaths } = options;
  if (!includeDirs) return empty$2;
  if (relativePaths) return filters && filters.length ? pushDirectoryFilterWithRelativePath(root) : pushDirectoryWithRelativePath(root);
  return filters && filters.length ? pushDirectoryFilter : pushDirectory;
}
var pushFileFilterAndCount = (filename, _paths, counts, filters) => {
  if (filters.every((filter) => filter(filename, false))) counts.files++;
};
var pushFileFilter = (filename, paths, _counts, filters) => {
  if (filters.every((filter) => filter(filename, false))) paths.push(filename);
};
var pushFileCount = (_filename, _paths, counts, _filters) => {
  counts.files++;
};
var pushFile = (filename, paths) => {
  paths.push(filename);
};
var empty$1 = () => {
};
function build$5(options) {
  const { excludeFiles, filters, onlyCounts } = options;
  if (excludeFiles) return empty$1;
  if (filters && filters.length) return onlyCounts ? pushFileFilterAndCount : pushFileFilter;
  else if (onlyCounts) return pushFileCount;
  else return pushFile;
}
var getArray = (paths) => {
  return paths;
};
var getArrayGroup = () => {
  return [""].slice(0, 0);
};
function build$4(options) {
  return options.group ? getArrayGroup : getArray;
}
var groupFiles = (groups, directory, files) => {
  groups.push({
    directory,
    files,
    dir: directory
  });
};
var empty = () => {
};
function build$3(options) {
  return options.group ? groupFiles : empty;
}
var resolveSymlinksAsync = function(path3, state, callback$1) {
  const { queue, fs: fs3, options: { suppressErrors } } = state;
  queue.enqueue();
  fs3.realpath(path3, (error, resolvedPath) => {
    if (error) return queue.dequeue(suppressErrors ? null : error, state);
    fs3.stat(resolvedPath, (error$1, stat2) => {
      if (error$1) return queue.dequeue(suppressErrors ? null : error$1, state);
      if (stat2.isDirectory() && isRecursive(path3, resolvedPath, state)) return queue.dequeue(null, state);
      callback$1(stat2, resolvedPath);
      queue.dequeue(null, state);
    });
  });
};
var resolveSymlinks = function(path3, state, callback$1) {
  const { queue, fs: fs3, options: { suppressErrors } } = state;
  queue.enqueue();
  try {
    const resolvedPath = fs3.realpathSync(path3);
    const stat2 = fs3.statSync(resolvedPath);
    if (stat2.isDirectory() && isRecursive(path3, resolvedPath, state)) return;
    callback$1(stat2, resolvedPath);
  } catch (e) {
    if (!suppressErrors) throw e;
  }
};
function build$2(options, isSynchronous) {
  if (!options.resolveSymlinks || options.excludeSymlinks) return null;
  return isSynchronous ? resolveSymlinks : resolveSymlinksAsync;
}
function isRecursive(path3, resolved, state) {
  if (state.options.useRealPaths) return isRecursiveUsingRealPaths(resolved, state);
  let parent = dirname(path3);
  let depth = 1;
  while (parent !== state.root && depth < 2) {
    const resolvedPath = state.symlinks.get(parent);
    const isSameRoot = !!resolvedPath && (resolvedPath === resolved || resolvedPath.startsWith(resolved) || resolved.startsWith(resolvedPath));
    if (isSameRoot) depth++;
    else parent = dirname(parent);
  }
  state.symlinks.set(path3, resolved);
  return depth > 1;
}
function isRecursiveUsingRealPaths(resolved, state) {
  return state.visited.includes(resolved + state.options.pathSeparator);
}
var onlyCountsSync = (state) => {
  return state.counts;
};
var groupsSync = (state) => {
  return state.groups;
};
var defaultSync = (state) => {
  return state.paths;
};
var limitFilesSync = (state) => {
  return state.paths.slice(0, state.options.maxFiles);
};
var onlyCountsAsync = (state, error, callback$1) => {
  report(error, callback$1, state.counts, state.options.suppressErrors);
  return null;
};
var defaultAsync = (state, error, callback$1) => {
  report(error, callback$1, state.paths, state.options.suppressErrors);
  return null;
};
var limitFilesAsync = (state, error, callback$1) => {
  report(error, callback$1, state.paths.slice(0, state.options.maxFiles), state.options.suppressErrors);
  return null;
};
var groupsAsync = (state, error, callback$1) => {
  report(error, callback$1, state.groups, state.options.suppressErrors);
  return null;
};
function report(error, callback$1, output, suppressErrors) {
  if (error && !suppressErrors) callback$1(error, output);
  else callback$1(null, output);
}
function build$1(options, isSynchronous) {
  const { onlyCounts, group, maxFiles } = options;
  if (onlyCounts) return isSynchronous ? onlyCountsSync : onlyCountsAsync;
  else if (group) return isSynchronous ? groupsSync : groupsAsync;
  else if (maxFiles) return isSynchronous ? limitFilesSync : limitFilesAsync;
  else return isSynchronous ? defaultSync : defaultAsync;
}
var readdirOpts = { withFileTypes: true };
var walkAsync = (state, crawlPath, directoryPath, currentDepth, callback$1) => {
  state.queue.enqueue();
  if (currentDepth < 0) return state.queue.dequeue(null, state);
  const { fs: fs3 } = state;
  state.visited.push(crawlPath);
  state.counts.directories++;
  fs3.readdir(crawlPath || ".", readdirOpts, (error, entries = []) => {
    callback$1(entries, directoryPath, currentDepth);
    state.queue.dequeue(state.options.suppressErrors ? null : error, state);
  });
};
var walkSync = (state, crawlPath, directoryPath, currentDepth, callback$1) => {
  const { fs: fs3 } = state;
  if (currentDepth < 0) return;
  state.visited.push(crawlPath);
  state.counts.directories++;
  let entries = [];
  try {
    entries = fs3.readdirSync(crawlPath || ".", readdirOpts);
  } catch (e) {
    if (!state.options.suppressErrors) throw e;
  }
  callback$1(entries, directoryPath, currentDepth);
};
function build(isSynchronous) {
  return isSynchronous ? walkSync : walkAsync;
}
var Queue = class {
  count = 0;
  constructor(onQueueEmpty) {
    this.onQueueEmpty = onQueueEmpty;
  }
  enqueue() {
    this.count++;
    return this.count;
  }
  dequeue(error, output) {
    if (this.onQueueEmpty && (--this.count <= 0 || error)) {
      this.onQueueEmpty(error, output);
      if (error) {
        output.controller.abort();
        this.onQueueEmpty = void 0;
      }
    }
  }
};
var Counter = class {
  _files = 0;
  _directories = 0;
  set files(num) {
    this._files = num;
  }
  get files() {
    return this._files;
  }
  set directories(num) {
    this._directories = num;
  }
  get directories() {
    return this._directories;
  }
  /**
  * @deprecated use `directories` instead
  */
  /* c8 ignore next 3 */
  get dirs() {
    return this._directories;
  }
};
var Aborter = class {
  aborted = false;
  abort() {
    this.aborted = true;
  }
};
var Walker = class {
  root;
  isSynchronous;
  state;
  joinPath;
  pushDirectory;
  pushFile;
  getArray;
  groupFiles;
  resolveSymlink;
  walkDirectory;
  callbackInvoker;
  constructor(root, options, callback$1) {
    this.isSynchronous = !callback$1;
    this.callbackInvoker = build$1(options, this.isSynchronous);
    this.root = normalizePath(root, options);
    this.state = {
      root: isRootDirectory(this.root) ? this.root : this.root.slice(0, -1),
      paths: [""].slice(0, 0),
      groups: [],
      counts: new Counter(),
      options,
      queue: new Queue((error, state) => this.callbackInvoker(state, error, callback$1)),
      symlinks: /* @__PURE__ */ new Map(),
      visited: [""].slice(0, 0),
      controller: new Aborter(),
      fs: options.fs || nativeFs
    };
    this.joinPath = build$7(this.root, options);
    this.pushDirectory = build$6(this.root, options);
    this.pushFile = build$5(options);
    this.getArray = build$4(options);
    this.groupFiles = build$3(options);
    this.resolveSymlink = build$2(options, this.isSynchronous);
    this.walkDirectory = build(this.isSynchronous);
  }
  start() {
    this.pushDirectory(this.root, this.state.paths, this.state.options.filters);
    this.walkDirectory(this.state, this.root, this.root, this.state.options.maxDepth, this.walk);
    return this.isSynchronous ? this.callbackInvoker(this.state, null) : null;
  }
  walk = (entries, directoryPath, depth) => {
    const { paths, options: { filters, resolveSymlinks: resolveSymlinks$1, excludeSymlinks, exclude, maxFiles, signal, useRealPaths, pathSeparator }, controller } = this.state;
    if (controller.aborted || signal && signal.aborted || maxFiles && paths.length > maxFiles) return;
    const files = this.getArray(this.state.paths);
    for (let i = 0; i < entries.length; ++i) {
      const entry = entries[i];
      if (entry.isFile() || entry.isSymbolicLink() && !resolveSymlinks$1 && !excludeSymlinks) {
        const filename = this.joinPath(entry.name, directoryPath);
        this.pushFile(filename, files, this.state.counts, filters);
      } else if (entry.isDirectory()) {
        let path3 = joinDirectoryPath(entry.name, directoryPath, this.state.options.pathSeparator);
        if (exclude && exclude(entry.name, path3)) continue;
        this.pushDirectory(path3, paths, filters);
        this.walkDirectory(this.state, path3, path3, depth - 1, this.walk);
      } else if (this.resolveSymlink && entry.isSymbolicLink()) {
        let path3 = joinPathWithBasePath(entry.name, directoryPath);
        this.resolveSymlink(path3, this.state, (stat2, resolvedPath) => {
          if (stat2.isDirectory()) {
            resolvedPath = normalizePath(resolvedPath, this.state.options);
            if (exclude && exclude(entry.name, useRealPaths ? resolvedPath : path3 + pathSeparator)) return;
            this.walkDirectory(this.state, resolvedPath, useRealPaths ? resolvedPath : path3 + pathSeparator, depth - 1, this.walk);
          } else {
            resolvedPath = useRealPaths ? resolvedPath : path3;
            const filename = basename(resolvedPath);
            const directoryPath$1 = normalizePath(dirname(resolvedPath), this.state.options);
            resolvedPath = this.joinPath(filename, directoryPath$1);
            this.pushFile(resolvedPath, files, this.state.counts, filters);
          }
        });
      }
    }
    this.groupFiles(this.state.groups, directoryPath, files);
  };
};
function promise(root, options) {
  return new Promise((resolve$1, reject) => {
    callback(root, options, (err, output) => {
      if (err) return reject(err);
      resolve$1(output);
    });
  });
}
function callback(root, options, callback$1) {
  let walker = new Walker(root, options, callback$1);
  walker.start();
}
function sync(root, options) {
  const walker = new Walker(root, options);
  return walker.start();
}
var APIBuilder = class {
  constructor(root, options) {
    this.root = root;
    this.options = options;
  }
  withPromise() {
    return promise(this.root, this.options);
  }
  withCallback(cb) {
    callback(this.root, this.options, cb);
  }
  sync() {
    return sync(this.root, this.options);
  }
};
var pm = null;
try {
  __require2.resolve("picomatch");
  pm = __require2("picomatch");
} catch {
}
var Builder = class {
  globCache = {};
  options = {
    maxDepth: Infinity,
    suppressErrors: true,
    pathSeparator: sep,
    filters: []
  };
  globFunction;
  constructor(options) {
    this.options = {
      ...this.options,
      ...options
    };
    this.globFunction = this.options.globFunction;
  }
  group() {
    this.options.group = true;
    return this;
  }
  withPathSeparator(separator) {
    this.options.pathSeparator = separator;
    return this;
  }
  withBasePath() {
    this.options.includeBasePath = true;
    return this;
  }
  withRelativePaths() {
    this.options.relativePaths = true;
    return this;
  }
  withDirs() {
    this.options.includeDirs = true;
    return this;
  }
  withMaxDepth(depth) {
    this.options.maxDepth = depth;
    return this;
  }
  withMaxFiles(limit) {
    this.options.maxFiles = limit;
    return this;
  }
  withFullPaths() {
    this.options.resolvePaths = true;
    this.options.includeBasePath = true;
    return this;
  }
  withErrors() {
    this.options.suppressErrors = false;
    return this;
  }
  withSymlinks({ resolvePaths = true } = {}) {
    this.options.resolveSymlinks = true;
    this.options.useRealPaths = resolvePaths;
    return this.withFullPaths();
  }
  withAbortSignal(signal) {
    this.options.signal = signal;
    return this;
  }
  normalize() {
    this.options.normalizePath = true;
    return this;
  }
  filter(predicate) {
    this.options.filters.push(predicate);
    return this;
  }
  onlyDirs() {
    this.options.excludeFiles = true;
    this.options.includeDirs = true;
    return this;
  }
  exclude(predicate) {
    this.options.exclude = predicate;
    return this;
  }
  onlyCounts() {
    this.options.onlyCounts = true;
    return this;
  }
  crawl(root) {
    return new APIBuilder(root || ".", this.options);
  }
  withGlobFunction(fn) {
    this.globFunction = fn;
    return this;
  }
  /**
  * @deprecated Pass options using the constructor instead:
  * ```ts
  * new fdir(options).crawl("/path/to/root");
  * ```
  * This method will be removed in v7.0
  */
  /* c8 ignore next 4 */
  crawlWithOptions(root, options) {
    this.options = {
      ...this.options,
      ...options
    };
    return new APIBuilder(root || ".", this.options);
  }
  glob(...patterns) {
    if (this.globFunction) return this.globWithOptions(patterns);
    return this.globWithOptions(patterns, ...[{ dot: true }]);
  }
  globWithOptions(patterns, ...options) {
    const globFn = this.globFunction || pm;
    if (!globFn) throw new Error("Please specify a glob function to use glob matching.");
    var isMatch = this.globCache[patterns.join("\0")];
    if (!isMatch) {
      isMatch = globFn(patterns, ...options);
      this.globCache[patterns.join("\0")] = isMatch;
    }
    this.options.filters.push((path3) => isMatch(path3));
    return this;
  }
};

// ../agent-kit/node_modules/.pnpm/tinyglobby@0.2.16/node_modules/tinyglobby/dist/index.mjs
var import_picomatch = __toESM(require_picomatch2(), 1);
var isReadonlyArray = Array.isArray;
var BACKSLASHES = /\\/g;
var isWin = process.platform === "win32";
var ONLY_PARENT_DIRECTORIES = /^(\/?\.\.)+$/;
function getPartialMatcher(patterns, options = {}) {
  const patternsCount = patterns.length;
  const patternsParts = Array(patternsCount);
  const matchers = Array(patternsCount);
  let i, j;
  for (i = 0; i < patternsCount; i++) {
    const parts = splitPattern(patterns[i]);
    patternsParts[i] = parts;
    const partsCount = parts.length;
    const partMatchers = Array(partsCount);
    for (j = 0; j < partsCount; j++) partMatchers[j] = (0, import_picomatch.default)(parts[j], options);
    matchers[i] = partMatchers;
  }
  return (input) => {
    const inputParts = input.split("/");
    if (inputParts[0] === ".." && ONLY_PARENT_DIRECTORIES.test(input)) return true;
    for (i = 0; i < patternsCount; i++) {
      const patternParts = patternsParts[i];
      const matcher = matchers[i];
      const inputPatternCount = inputParts.length;
      const minParts = Math.min(inputPatternCount, patternParts.length);
      j = 0;
      while (j < minParts) {
        const part = patternParts[j];
        if (part.includes("/")) return true;
        if (!matcher[j](inputParts[j])) break;
        if (!options.noglobstar && part === "**") return true;
        j++;
      }
      if (j === inputPatternCount) return true;
    }
    return false;
  };
}
var WIN32_ROOT_DIR = /^[A-Z]:\/$/i;
var isRoot = isWin ? (p) => WIN32_ROOT_DIR.test(p) : (p) => p === "/";
function buildFormat(cwd, root, absolute) {
  if (cwd === root || root.startsWith(`${cwd}/`)) {
    if (absolute) {
      const start = cwd.length + +!isRoot(cwd);
      return (p, isDir) => p.slice(start, isDir ? -1 : void 0) || ".";
    }
    const prefix = root.slice(cwd.length + 1);
    if (prefix) return (p, isDir) => {
      if (p === ".") return prefix;
      const result = `${prefix}/${p}`;
      return isDir ? result.slice(0, -1) : result;
    };
    return (p, isDir) => isDir && p !== "." ? p.slice(0, -1) : p;
  }
  if (absolute) return (p) => posix.relative(cwd, p) || ".";
  return (p) => posix.relative(cwd, `${root}/${p}`) || ".";
}
function buildRelative(cwd, root) {
  if (root.startsWith(`${cwd}/`)) {
    const prefix = root.slice(cwd.length + 1);
    return (p) => `${prefix}/${p}`;
  }
  return (p) => {
    const result = posix.relative(cwd, `${root}/${p}`);
    return p[p.length - 1] === "/" && result !== "" ? `${result}/` : result || ".";
  };
}
var splitPatternOptions = { parts: true };
function splitPattern(path3) {
  var _result$parts;
  const result = import_picomatch.default.scan(path3, splitPatternOptions);
  return ((_result$parts = result.parts) === null || _result$parts === void 0 ? void 0 : _result$parts.length) ? result.parts : [path3];
}
var POSIX_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g;
var WIN32_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}]|^!|[!+@](?=\())/g;
var escapePosixPath = (path3) => path3.replace(POSIX_UNESCAPED_GLOB_SYMBOLS, "\\$&");
var escapeWin32Path = (path3) => path3.replace(WIN32_UNESCAPED_GLOB_SYMBOLS, "\\$&");
var escapePath = isWin ? escapeWin32Path : escapePosixPath;
function isDynamicPattern(pattern, options) {
  if ((options === null || options === void 0 ? void 0 : options.caseSensitiveMatch) === false) return true;
  const scan = import_picomatch.default.scan(pattern);
  return scan.isGlob || scan.negated;
}
function log(...tasks) {
  console.log(`[tinyglobby ${(/* @__PURE__ */ new Date()).toLocaleTimeString("es")}]`, ...tasks);
}
function ensureStringArray(value) {
  return typeof value === "string" ? [value] : value !== null && value !== void 0 ? value : [];
}
var PARENT_DIRECTORY = /^(\/?\.\.)+/;
var ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;
function normalizePattern(pattern, opts, props, isIgnore) {
  var _PARENT_DIRECTORY$exe;
  const cwd = opts.cwd;
  let result = pattern;
  if (pattern[pattern.length - 1] === "/") result = pattern.slice(0, -1);
  if (result[result.length - 1] !== "*" && opts.expandDirectories) result += "/**";
  const escapedCwd = escapePath(cwd);
  result = isAbsolute(result.replace(ESCAPING_BACKSLASHES, "")) ? posix.relative(escapedCwd, result) : posix.normalize(result);
  const parentDir = (_PARENT_DIRECTORY$exe = PARENT_DIRECTORY.exec(result)) === null || _PARENT_DIRECTORY$exe === void 0 ? void 0 : _PARENT_DIRECTORY$exe[0];
  const parts = splitPattern(result);
  if (parentDir) {
    const n = (parentDir.length + 1) / 3;
    let i = 0;
    const cwdParts = escapedCwd.split("/");
    while (i < n && parts[i + n] === cwdParts[cwdParts.length + i - n]) {
      result = result.slice(0, (n - i - 1) * 3) + result.slice((n - i) * 3 + parts[i + n].length + 1) || ".";
      i++;
    }
    const potentialRoot = posix.join(cwd, parentDir.slice(i * 3));
    if (potentialRoot[0] !== "." && props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -n + i;
    }
  }
  if (!isIgnore && props.depthOffset >= 0) {
    var _props$commonPath;
    (_props$commonPath = props.commonPath) !== null && _props$commonPath !== void 0 || (props.commonPath = parts);
    const newCommonPath = [];
    const length = Math.min(props.commonPath.length, parts.length);
    for (let i = 0; i < length; i++) {
      const part = parts[i];
      if (part === "**" && !parts[i + 1]) {
        newCommonPath.pop();
        break;
      }
      if (i === parts.length - 1 || part !== props.commonPath[i] || isDynamicPattern(part)) break;
      newCommonPath.push(part);
    }
    props.depthOffset = newCommonPath.length;
    props.commonPath = newCommonPath;
    props.root = newCommonPath.length > 0 ? posix.join(cwd, ...newCommonPath) : cwd;
  }
  return result;
}
function processPatterns(options, patterns, props) {
  const matchPatterns = [];
  const ignorePatterns = [];
  for (const pattern of options.ignore) {
    if (!pattern) continue;
    if (pattern[0] !== "!" || pattern[1] === "(") ignorePatterns.push(normalizePattern(pattern, options, props, true));
  }
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (pattern[0] !== "!" || pattern[1] === "(") matchPatterns.push(normalizePattern(pattern, options, props, false));
    else if (pattern[1] !== "!" || pattern[2] === "(") ignorePatterns.push(normalizePattern(pattern.slice(1), options, props, true));
  }
  return {
    match: matchPatterns,
    ignore: ignorePatterns
  };
}
function buildCrawler(options, patterns) {
  const cwd = options.cwd;
  const props = {
    root: cwd,
    depthOffset: 0
  };
  const processed = processPatterns(options, patterns, props);
  if (options.debug) log("internal processing patterns:", processed);
  const { absolute, caseSensitiveMatch, debug, dot, followSymbolicLinks, onlyDirectories } = options;
  const root = props.root.replace(BACKSLASHES, "");
  const matchOptions = {
    dot,
    nobrace: options.braceExpansion === false,
    nocase: !caseSensitiveMatch,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  };
  const matcher = (0, import_picomatch.default)(processed.match, matchOptions);
  const ignore = (0, import_picomatch.default)(processed.ignore, matchOptions);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);
  const format = buildFormat(cwd, root, absolute);
  const excludeFormatter = absolute ? format : buildFormat(cwd, root, true);
  const excludePredicate = (_, p) => {
    const relativePath = excludeFormatter(p, true);
    return relativePath !== "." && !partialMatcher(relativePath) || ignore(relativePath);
  };
  let maxDepth;
  if (options.deep !== void 0) maxDepth = Math.round(options.deep - props.depthOffset);
  const crawler = new Builder({
    filters: [debug ? (p, isDirectory) => {
      const path3 = format(p, isDirectory);
      const matches = matcher(path3) && !ignore(path3);
      if (matches) log(`matched ${path3}`);
      return matches;
    } : (p, isDirectory) => {
      const path3 = format(p, isDirectory);
      return matcher(path3) && !ignore(path3);
    }],
    exclude: debug ? (_, p) => {
      const skipped = excludePredicate(_, p);
      log(`${skipped ? "skipped" : "crawling"} ${p}`);
      return skipped;
    } : excludePredicate,
    fs: options.fs,
    pathSeparator: "/",
    relativePaths: !absolute,
    resolvePaths: absolute,
    includeBasePath: absolute,
    resolveSymlinks: followSymbolicLinks,
    excludeSymlinks: !followSymbolicLinks,
    excludeFiles: onlyDirectories,
    includeDirs: onlyDirectories || !options.onlyFiles,
    maxDepth,
    signal: options.signal
  }).crawl(root);
  if (options.debug) log("internal properties:", {
    ...props,
    root
  });
  return [crawler, cwd !== root && !absolute && buildRelative(cwd, root)];
}
function formatPaths(paths, mapper) {
  if (mapper) for (let i = paths.length - 1; i >= 0; i--) paths[i] = mapper(paths[i]);
  return paths;
}
var defaultOptions = {
  caseSensitiveMatch: true,
  cwd: process.cwd(),
  debug: !!process.env.TINYGLOBBY_DEBUG,
  expandDirectories: true,
  followSymbolicLinks: true,
  onlyFiles: true
};
function getOptions(options) {
  const opts = {
    ...defaultOptions,
    ...options
  };
  opts.cwd = (opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : resolve2(opts.cwd)).replace(BACKSLASHES, "/");
  opts.ignore = ensureStringArray(opts.ignore);
  opts.fs && (opts.fs = {
    readdir: opts.fs.readdir || readdir,
    readdirSync: opts.fs.readdirSync || readdirSync,
    realpath: opts.fs.realpath || realpath,
    realpathSync: opts.fs.realpathSync || realpathSync,
    stat: opts.fs.stat || stat,
    statSync: opts.fs.statSync || statSync
  });
  if (opts.debug) log("globbing with options:", opts);
  return opts;
}
function getCrawler(globInput, inputOptions = {}) {
  var _ref;
  if (globInput && (inputOptions === null || inputOptions === void 0 ? void 0 : inputOptions.patterns)) throw new Error("Cannot pass patterns as both an argument and an option");
  const isModern = isReadonlyArray(globInput) || typeof globInput === "string";
  const patterns = ensureStringArray((_ref = isModern ? globInput : globInput.patterns) !== null && _ref !== void 0 ? _ref : "**/*");
  const options = getOptions(isModern ? inputOptions : globInput);
  return patterns.length > 0 ? buildCrawler(options, patterns) : [];
}
async function glob(globInput, options) {
  const [crawler, relative2] = getCrawler(globInput, options);
  return crawler ? formatPaths(await crawler.withPromise(), relative2) : [];
}
function globSync(globInput, options) {
  const [crawler, relative2] = getCrawler(globInput, options);
  return crawler ? formatPaths(crawler.sync(), relative2) : [];
}

// ../agent-kit/node_modules/.pnpm/js-yaml@4.1.1/node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var Type = type;
var Schema = schema;
var FAILSAFE_SCHEMA = failsafe;
var JSON_SCHEMA = json;
var CORE_SCHEMA = core;
var DEFAULT_SCHEMA = _default;
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var YAMLException = exception;
var types = {
  binary,
  float,
  map,
  null: _null,
  pairs,
  set,
  timestamp,
  bool,
  int,
  merge,
  omap,
  seq,
  str
};
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");
var jsYaml = {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
};

// ../agent-kit/node_modules/.pnpm/@manypkg+tools@2.1.1/node_modules/@manypkg/tools/dist/manypkg-tools.js
var import_jju = __toESM(require_jju(), 1);
var InvalidMonorepoError = class extends Error {
};
var readJson = async (directory, file) => JSON.parse(await fsp__default.readFile(path__default.join(directory, file), "utf-8"));
var readJsonSync = (directory, file) => JSON.parse(fs__default.readFileSync(path__default.join(directory, file), "utf-8"));
async function expandPackageGlobs(packageGlobs, directory) {
  const relativeDirectories = await glob(packageGlobs, {
    cwd: directory,
    onlyDirectories: true,
    ignore: ["**/node_modules"],
    expandDirectories: false
  });
  const directories = relativeDirectories.map((p) => path__default.resolve(directory, p)).sort();
  const discoveredPackages = await Promise.all(directories.map((dir) => fsp__default.readFile(path__default.join(dir, "package.json"), "utf-8").catch((err) => {
    if (err && err.code === "ENOENT") {
      return void 0;
    }
    throw err;
  }).then((result) => {
    if (result) {
      return {
        dir: path__default.resolve(dir),
        relativeDir: path__default.relative(directory, dir),
        packageJson: JSON.parse(result)
      };
    }
  })));
  return discoveredPackages.filter((pkg) => pkg);
}
function expandPackageGlobsSync(packageGlobs, directory) {
  const relativeDirectories = globSync(packageGlobs, {
    cwd: directory,
    onlyDirectories: true,
    ignore: ["**/node_modules"],
    expandDirectories: false
  });
  const directories = relativeDirectories.map((p) => path__default.resolve(directory, p)).sort();
  const discoveredPackages = directories.map((dir) => {
    try {
      const packageJson = readJsonSync(dir, "package.json");
      return {
        dir: path__default.resolve(dir),
        relativeDir: path__default.relative(directory, dir),
        packageJson
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return void 0;
      }
      throw err;
    }
  });
  return discoveredPackages.filter((pkg) => pkg);
}
async function hasBunLockFile(directory) {
  try {
    await Promise.any([fsp.access(path.join(directory, "bun.lockb"), F_OK), fsp.access(path.join(directory, "bun.lock"), F_OK)]);
    return true;
  } catch (err) {
    return false;
  }
}
function hasBunLockFileSync(directory) {
  try {
    fs.accessSync(path.join(directory, "bun.lockb"), F_OK);
    return true;
  } catch (err) {
    try {
      fs.accessSync(path.join(directory, "bun.lock"), F_OK);
      return true;
    } catch (err2) {
      return false;
    }
  }
}
var BunTool = {
  type: "bun",
  async isMonorepoRoot(directory) {
    try {
      const [pkgJson, hasLockFile] = await Promise.all([readJson(directory, "package.json"), hasBunLockFile(directory)]);
      if (pkgJson.workspaces && hasLockFile) {
        if (Array.isArray(pkgJson.workspaces) || Array.isArray(pkgJson.workspaces.packages)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  isMonorepoRootSync(directory) {
    try {
      const hasLockFile = hasBunLockFileSync(directory);
      if (!hasLockFile) {
        return false;
      }
      const pkgJson = readJsonSync(directory, "package.json");
      if (pkgJson.workspaces) {
        if (Array.isArray(pkgJson.workspaces) || Array.isArray(pkgJson.workspaces.packages)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  async getPackages(directory) {
    const rootDir = path.resolve(directory);
    try {
      const pkgJson = await readJson(rootDir, "package.json");
      const packageGlobs = Array.isArray(pkgJson.workspaces) ? pkgJson.workspaces : pkgJson.workspaces?.packages || [];
      return {
        tool: BunTool,
        packages: await expandPackageGlobs(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${BunTool.type} monorepo root`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path.resolve(directory);
    try {
      const pkgJson = readJsonSync(rootDir, "package.json");
      const packageGlobs = Array.isArray(pkgJson.workspaces) ? pkgJson.workspaces : pkgJson.workspaces?.packages || [];
      return {
        tool: BunTool,
        packages: expandPackageGlobsSync(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${BunTool.type} monorepo root`);
      }
      throw err;
    }
  }
};
var LernaTool = {
  type: "lerna",
  async isMonorepoRoot(directory) {
    try {
      const lernaJson = await readJson(directory, "lerna.json");
      if (lernaJson.useWorkspaces !== true) {
        return true;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  isMonorepoRootSync(directory) {
    try {
      const lernaJson = readJsonSync(directory, "lerna.json");
      if (lernaJson.useWorkspaces !== true) {
        return true;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const lernaJson = await readJson(rootDir, "lerna.json");
      const pkgJson = await readJson(rootDir, "package.json");
      const packageGlobs = lernaJson.packages || ["packages/*"];
      return {
        tool: LernaTool,
        packages: await expandPackageGlobs(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${LernaTool.type} monorepo root: missing lerna.json and/or package.json`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const lernaJson = readJsonSync(rootDir, "lerna.json");
      const pkgJson = readJsonSync(rootDir, "package.json");
      const packageGlobs = lernaJson.packages || ["packages/*"];
      return {
        tool: LernaTool,
        packages: expandPackageGlobsSync(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${LernaTool.type} monorepo root: missing lerna.json and/or package.json`);
      }
      throw err;
    }
  }
};
var NpmTool = {
  type: "npm",
  async isMonorepoRoot(directory) {
    try {
      const [pkgJson] = await Promise.all([readJson(directory, "package.json"), fsp__default.access(path__default.join(directory, "package-lock.json"), F_OK)]);
      if (pkgJson.workspaces) {
        if (Array.isArray(pkgJson.workspaces)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  isMonorepoRootSync(directory) {
    try {
      fs__default.accessSync(path__default.join(directory, "package-lock.json"), F_OK);
      const pkgJson = readJsonSync(directory, "package.json");
      if (pkgJson.workspaces) {
        if (Array.isArray(pkgJson.workspaces)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = await readJson(rootDir, "package.json");
      const packageGlobs = pkgJson.workspaces;
      return {
        tool: NpmTool,
        packages: await expandPackageGlobs(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${NpmTool.type} monorepo root`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = readJsonSync(rootDir, "package.json");
      const packageGlobs = pkgJson.workspaces;
      return {
        tool: NpmTool,
        packages: expandPackageGlobsSync(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${NpmTool.type} monorepo root`);
      }
      throw err;
    }
  }
};
async function readYamlFile(path3) {
  return fsp__default.readFile(path3, "utf8").then((data) => jsYaml.load(data));
}
function readYamlFileSync(path3) {
  return jsYaml.load(fs__default.readFileSync(path3, "utf8"));
}
var PnpmTool = {
  type: "pnpm",
  async isMonorepoRoot(directory) {
    try {
      const manifest = await readYamlFile(path__default.join(directory, "pnpm-workspace.yaml"));
      if (manifest.packages) {
        return true;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  isMonorepoRootSync(directory) {
    try {
      const manifest = readYamlFileSync(path__default.join(directory, "pnpm-workspace.yaml"));
      if (manifest.packages) {
        return true;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const manifest = await readYamlFile(path__default.join(rootDir, "pnpm-workspace.yaml"));
      const pkgJson = await readJson(rootDir, "package.json");
      const packageGlobs = manifest.packages;
      return {
        tool: PnpmTool,
        packages: await expandPackageGlobs(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${PnpmTool.type} monorepo root: missing pnpm-workspace.yaml and/or package.json`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const manifest = readYamlFileSync(path__default.join(rootDir, "pnpm-workspace.yaml"));
      const pkgJson = readJsonSync(rootDir, "package.json");
      const packageGlobs = manifest.packages;
      return {
        tool: PnpmTool,
        packages: expandPackageGlobsSync(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${PnpmTool.type} monorepo root: missing pnpm-workspace.yaml and/or package.json`);
      }
      throw err;
    }
  }
};
var RootTool = {
  type: "root",
  async isMonorepoRoot(_directory) {
    return false;
  },
  isMonorepoRootSync(_directory) {
    return false;
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = await readJson(rootDir, "package.json");
      const pkg = {
        dir: rootDir,
        relativeDir: ".",
        packageJson: pkgJson
      };
      return {
        tool: RootTool,
        packages: [pkg],
        rootPackage: pkg,
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${RootTool.type} monorepo root`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = readJsonSync(rootDir, "package.json");
      const pkg = {
        dir: rootDir,
        relativeDir: ".",
        packageJson: pkgJson
      };
      return {
        tool: RootTool,
        packages: [pkg],
        rootPackage: pkg,
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${RootTool.type} monorepo root`);
      }
      throw err;
    }
  }
};
var RushTool = {
  type: "rush",
  async isMonorepoRoot(directory) {
    try {
      await fsp__default.access(path__default.join(directory, "rush.json"), F_OK);
      return true;
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
  },
  isMonorepoRootSync(directory) {
    try {
      fs__default.accessSync(path__default.join(directory, "rush.json"), F_OK);
      return true;
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const rushText = await fsp__default.readFile(path__default.join(rootDir, "rush.json"), "utf8");
      const rushJson = import_jju.default.parse(rushText);
      const directories = rushJson.projects.map((project) => path__default.resolve(rootDir, project.projectFolder));
      const packages = await Promise.all(directories.map(async (dir) => {
        return {
          dir,
          relativeDir: path__default.relative(directory, dir),
          packageJson: await readJson(dir, "package.json")
        };
      }));
      return {
        tool: RushTool,
        packages,
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${RushTool.type} monorepo root: missing rush.json`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const rushText = fs__default.readFileSync(path__default.join(rootDir, "rush.json"), "utf8");
      const rushJson = import_jju.default.parse(rushText);
      const directories = rushJson.projects.map((project) => path__default.resolve(rootDir, project.projectFolder));
      const packages = directories.map((dir) => {
        const packageJson = readJsonSync(dir, "package.json");
        return {
          dir,
          relativeDir: path__default.relative(directory, dir),
          packageJson
        };
      });
      return {
        tool: RushTool,
        packages,
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${RushTool.type} monorepo root: missing rush.json`);
      }
      throw err;
    }
  }
};
var YarnTool = {
  type: "yarn",
  async isMonorepoRoot(directory) {
    try {
      const [pkgJson] = await Promise.all([readJson(directory, "package.json"), fsp__default.access(path__default.join(directory, "yarn.lock"), F_OK)]);
      if (pkgJson.workspaces) {
        if (Array.isArray(pkgJson.workspaces) || Array.isArray(pkgJson.workspaces.packages)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  isMonorepoRootSync(directory) {
    try {
      fs__default.accessSync(path__default.join(directory, "yarn.lock"), F_OK);
      const pkgJson = readJsonSync(directory, "package.json");
      if (pkgJson.workspaces) {
        if (Array.isArray(pkgJson.workspaces) || Array.isArray(pkgJson.workspaces.packages)) {
          return true;
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
    return false;
  },
  async getPackages(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = await readJson(rootDir, "package.json");
      const packageGlobs = Array.isArray(pkgJson.workspaces) ? pkgJson.workspaces : pkgJson.workspaces.packages;
      return {
        tool: YarnTool,
        packages: await expandPackageGlobs(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${YarnTool.type} monorepo root`);
      }
      throw err;
    }
  },
  getPackagesSync(directory) {
    const rootDir = path__default.resolve(directory);
    try {
      const pkgJson = readJsonSync(rootDir, "package.json");
      const packageGlobs = Array.isArray(pkgJson.workspaces) ? pkgJson.workspaces : pkgJson.workspaces.packages;
      return {
        tool: YarnTool,
        packages: expandPackageGlobsSync(packageGlobs, rootDir),
        rootPackage: {
          dir: rootDir,
          relativeDir: ".",
          packageJson: pkgJson
        },
        rootDir
      };
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new InvalidMonorepoError(`Directory ${rootDir} is not a valid ${YarnTool.type} monorepo root`);
      }
      throw err;
    }
  }
};

// ../agent-kit/node_modules/.pnpm/@manypkg+find-root@3.1.0/node_modules/@manypkg/find-root/dist/manypkg-find-root.js
import fs2 from "node:fs";
import path2 from "node:path";
var DEFAULT_TOOLS = [YarnTool, PnpmTool, NpmTool, BunTool, LernaTool, RushTool, RootTool];
var NoPkgJsonFound = class extends Error {
  constructor(directory) {
    super(`No package.json could be found upwards from directory ${directory}`);
    this.directory = directory;
  }
};
var NoMatchingMonorepoFound = class extends Error {
  constructor(directory) {
    super(`No monorepo matching the list of supported monorepos could be found upwards from directory ${directory}`);
    this.directory = directory;
  }
};
function findRootSync(cwd, options = {}) {
  let monorepoRoot;
  const tools = options.tools || DEFAULT_TOOLS;
  findUpSync((directory) => {
    for (const tool of tools) {
      if (tool.isMonorepoRootSync(directory)) {
        monorepoRoot = {
          tool: tool.type,
          rootDir: directory
        };
        return directory;
      }
    }
  }, cwd);
  if (monorepoRoot) {
    return monorepoRoot;
  }
  if (!tools.includes(RootTool)) {
    throw new NoMatchingMonorepoFound(cwd);
  }
  const rootDir = findUpSync((directory) => {
    const exists = fs2.existsSync(path2.join(directory, "package.json"));
    return exists ? directory : void 0;
  }, cwd);
  if (!rootDir) {
    throw new NoPkgJsonFound(cwd);
  }
  return {
    tool: RootTool.type,
    rootDir
  };
}
function findUpSync(matcher, cwd) {
  let directory = path2.resolve(cwd);
  const {
    root
  } = path2.parse(directory);
  while (directory && directory !== root) {
    const filePath = matcher(directory);
    if (filePath) {
      return path2.resolve(directory, filePath);
    }
    directory = path2.dirname(directory);
  }
}

// ../agent-kit/src/hooks/guard-switch/state.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
function getStateFilePath() {
  try {
    const { rootDir } = findRootSync(process.cwd());
    return join2(rootDir, ".claude", ".guard-state.json");
  } catch {
    return "/tmp/webpresso-guard-state.json";
  }
}
var STATE_FILE = getStateFilePath();
function isGuardEnabled() {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    return data.guardEnabled !== false;
  } catch {
    return true;
  }
}

// ../agent-kit/src/hooks/shared/mcp-sentinel.ts
import { readFileSync as readFileSync2, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join3 } from "node:path";
function sentinelPath() {
  return join3(tmpdir(), `ak-mcp-ready-${process.ppid}`);
}
function isMcpReady() {
  if (process.platform === "win32") return false;
  try {
    const pid = parseInt(readFileSync2(sentinelPath(), "utf-8"), 10);
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") return false;
    return false;
  }
}

// ../agent-kit/src/hooks/shared/hook-bootstrap.ts
import { closeSync, openSync } from "node:fs";
function suppressStderr() {
  if (process.platform === "win32") return;
  try {
    closeSync(2);
    openSync("/dev/null", "w");
  } catch {
  }
}
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ../agent-kit/src/hooks/shared/types.ts
function parseToolInput(json2) {
  return JSON.parse(json2);
}
function isBashInput(input) {
  return "command" in (input.tool_input || {});
}
function getFilePath(input) {
  const toolInput = input.tool_input;
  if (!toolInput || typeof toolInput !== "object") return void 0;
  const filePath = toolInput.file_path;
  return typeof filePath === "string" ? filePath : void 0;
}
function getCommand(input) {
  if (isBashInput(input)) {
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== "object") return void 0;
    const command = toolInput.command;
    return typeof command === "string" ? command : void 0;
  }
  return void 0;
}
function getContent(input) {
  const toolInput = input.tool_input;
  if (!toolInput || typeof toolInput !== "object") return void 0;
  const content = toolInput.content;
  const newString = toolInput.new_string;
  if (typeof content === "string") return content;
  if (typeof newString === "string") return newString;
  return void 0;
}

// ../agent-kit/src/hooks/pretool-guard/logger.ts
import { existsSync, mkdirSync, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
var DEFAULT_MAX_LINES = 250;
function createLogConfig(cwd = process.cwd()) {
  const logDir = process.env.PRETOOL_LOG_DIR || join4(cwd, "logs");
  return { logDir, logFile: join4(logDir, "pretool-guard.log"), enabled: process.env.PRETOOL_LOG !== "0", maxLines: DEFAULT_MAX_LINES };
}
function formatLogLine(entry, timestamp2) {
  const failures = entry.failures?.length ? ` failures=[${entry.failures.join(",")}]` : "";
  const error = entry.error ? ` error="${entry.error.slice(0, 100)}"` : "";
  return `${timestamp2} ${entry.status} ${entry.tool} target="${entry.target}"${failures}${error}`;
}
function rotateLines(lines, maxLines) {
  if (lines.length <= maxLines) return lines;
  return lines.slice(-maxLines);
}
function readLogLines(logFile) {
  if (!existsSync(logFile)) return [];
  try {
    return readFileSync3(logFile, "utf-8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
function writeLogLines(logFile, logDir, lines) {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  writeFileSync3(logFile, `${lines.join("\n")}
`);
}
function logRun(entry, config = createLogConfig()) {
  if (!config.enabled) return;
  try {
    const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
    const line = formatLogLine(entry, timestamp2);
    let lines = readLogLines(config.logFile);
    lines.push(line);
    lines = rotateLines(lines, config.maxLines);
    writeLogLines(config.logFile, config.logDir, lines);
  } catch {
  }
}

// ../agent-kit/src/hooks/pretool-guard/dev-routing.ts
import { closeSync as closeSync2, openSync as openSync2 } from "node:fs";
import { O_CREAT, O_EXCL, O_WRONLY } from "node:constants";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join5 } from "node:path";
var ROUTING_RULES = [
  {
    prefixes: ["just qa", "pnpm qa"],
    guidanceType: "qa",
    guidance: "Use ak_qa MCP tool instead \u2014 runs lint+typecheck+test and returns combined summary",
    tool: "ak_qa"
  },
  {
    prefixes: ["just test", "pnpm test", "vitest"],
    guidanceType: "test",
    guidance: "Use ak_test MCP tool instead \u2014 returns {passed, summary} not raw logs",
    tool: "ak_test"
  },
  {
    prefixes: ["just lint", "pnpm lint", "oxlint"],
    guidanceType: "lint",
    guidance: "Use ak_lint MCP tool instead \u2014 returns {passed, violations[]}",
    tool: "ak_lint"
  },
  {
    prefixes: ["just typecheck", "pnpm typecheck", "tsc"],
    guidanceType: "typecheck",
    guidance: "Use ak_typecheck MCP tool instead \u2014 returns {passed, errors[]}",
    tool: "ak_typecheck"
  }
];
var PASSTHROUGH_PREFIXES = ["just audit", "ak audit"];
var SAFE_PASSTHROUGH_PREFIXES = [
  "git status",
  "git add",
  "git commit",
  "git push",
  "ls",
  "mkdir",
  "mv",
  "rm ",
  "echo"
];
var SANDBOX_PREFIXES = [
  { prefix: "grep", guidance: "Use ctx_batch_execute for large outputs" },
  { prefix: "find", guidance: "Use ctx_batch_execute for large outputs" },
  { prefix: "cat", guidance: "Use ctx_execute or ctx_batch_execute for large outputs" },
  { prefix: "tail", guidance: "Use ctx_execute or ctx_batch_execute for large outputs" },
  { prefix: "head", guidance: "Use ctx_execute or ctx_batch_execute for large outputs" },
  { prefix: "curl", guidance: "Use ctx_execute or ctx_fetch_and_index" },
  { prefix: "wget", guidance: "Use ctx_execute or ctx_fetch_and_index" },
  { prefix: "git log", guidance: "Use ctx_execute_file or ctx_execute" },
  { prefix: "git diff", guidance: "Use ctx_execute_file or ctx_execute" },
  { prefix: "git show", guidance: "Use ctx_execute_file or ctx_execute" },
  { prefix: "npm test", guidance: "Use ctx_execute for test output" },
  { prefix: "npm run build", guidance: "Use ctx_execute for build output" },
  { prefix: "pnpm build", guidance: "Use ctx_execute for build output" }
];
function matchesPrefix(command, prefix) {
  return command === prefix || command.startsWith(prefix + " ");
}
function markerPath(sessionId, guidanceType) {
  const key = sessionId ?? String(process.ppid);
  return join5(tmpdir2(), `ak-routing-guidance-${key}-${guidanceType}`);
}
function shouldThrottle(sessionId, guidanceType, guidance) {
  const path3 = markerPath(sessionId, guidanceType);
  try {
    const fd = openSync2(path3, O_CREAT | O_EXCL | O_WRONLY);
    closeSync2(fd);
    return { guidance };
  } catch (err) {
    if (err.code === "EEXIST") return null;
    return { guidance };
  }
}
function routeCommand(command, sessionId) {
  const trimmed = command.trim();
  if (!trimmed) return null;
  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) return { action: { action: "passthrough" } };
  }
  for (const prefix of SAFE_PASSTHROUGH_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) return { action: { action: "passthrough" } };
  }
  for (const rule of ROUTING_RULES) {
    for (const prefix of rule.prefixes) {
      if (matchesPrefix(trimmed, prefix)) {
        const throttled = shouldThrottle(sessionId, rule.guidanceType, rule.guidance);
        if (throttled === null) {
          return { action: { action: "passthrough" }, throttleKey: rule.guidanceType };
        }
        return {
          action: { action: "deny", tool: rule.tool, guidance: rule.guidance },
          throttleKey: rule.guidanceType
        };
      }
    }
  }
  for (const { prefix, guidance } of SANDBOX_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) {
      return { action: { action: "sandbox", guidance } };
    }
  }
  return null;
}

// ../agent-kit/src/hooks/shared/validators/blueprint.ts
var SKIP_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/,
  /\.(test|spec)$/,
  /\.e2e\.(ts|tsx|js)$/,
  /\.e2e$/,
  /\.(config|rc)\.(ts|js|mjs|cjs|json|yaml|yml)$/,
  /(^|\/)\.[^/]+rc$/,
  /(^|\/)[^/]+\.(config|rc)$/,
  /\.(json|yaml|yml)$/,
  /\.md$/,
  /\.d\.ts$/,
  /(^|\/)(__tests__|__mocks__|test\/|tests\/|e2e\/)/,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.(next|wrangler|cache)\//,
  /(^|\/)coverage\//,
  /(^|\/)\.claude\//,
  /(^|\/)\.git\//,
  /\.gitignore$/,
  /(^|\/)infra\//,
  /\.env/,
  /(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/
];
function shouldSkipFile(filePath) {
  if (!filePath) return false;
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return SKIP_PATTERNS.some((pattern) => pattern.test(normalized));
}
function getSkipReason(filePath) {
  const skipChecks = [
    { pattern: /\.(test|spec)(\.|$)/, reason: "test file" },
    { pattern: /\.e2e(\.|$)/, reason: "e2e test file" },
    { pattern: /\.md$/, reason: "documentation" },
    { pattern: /\.(config|rc)(\.|$)/, reason: "config file" },
    { pattern: /\.(json|yaml|yml)$/, reason: "data file" },
    { pattern: /\.d\.ts$/, reason: "type definitions" },
    { pattern: /node_modules/, reason: "node_modules" },
    { pattern: /\.claude\//, reason: "Claude config" },
    { pattern: /infra\//, reason: "infrastructure" }
  ];
  for (const { pattern, reason } of skipChecks) {
    if (pattern.test(filePath)) return reason;
  }
  return "excluded file";
}
function validateBlueprint(filePath, options) {
  const bypassEnabled = options?.bypassEnabled ?? (process.env.BLUEPRINT_GUARD_SKIP === "1" || process.env.DBLUEPRINT_GUARD_SKIP === "1");
  if (bypassEnabled) {
    return {
      valid: true,
      reason: "Bypass enabled (BLUEPRINT_GUARD_SKIP=1)",
      details: { skipReason: "Bypass enabled (BLUEPRINT_GUARD_SKIP=1)" }
    };
  }
  if (filePath && shouldSkipFile(filePath)) {
    const skipReason = getSkipReason(filePath);
    return { valid: true, reason: `Skipped: ${skipReason}`, details: { skipReason } };
  }
  return {
    valid: true,
    reason: "Production file requires implementation plan (to be validated in Phase 6)",
    details: { hasPlan: void 0 }
  };
}

// ../agent-kit/src/hooks/pretool-guard/validators/blueprint.ts
function validateBlueprint2(input) {
  const filePath = getFilePath(input);
  const result = validateBlueprint(filePath);
  if (result.details?.skipReason) {
    return { validator: "blueprint", passed: true, skipped: true, skipReason: result.details.skipReason };
  }
  return { validator: "blueprint", passed: result.valid };
}

// ../agent-kit/src/hooks/pretool-guard/validators/skip-result.ts
function createSkipResult(validator, skipReason = "Bypass enabled") {
  return { validator, passed: true, skipped: true, skipReason };
}

// ../agent-kit/src/hooks/pretool-guard/validators/command-file.ts
var MAX_COMMAND_LINES = 600;
var MAX_SKILL_LINES = 400;
function validateCommandFile(input) {
  if (process.env.COMMAND_FILE_SKIP === "1") return createSkipResult("command-file");
  const filePath = getFilePath(input);
  const content = getContent(input);
  if (!filePath || !content) return { validator: "command-file", passed: true };
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const lines = content.split("\n").length;
  if (normalized.includes(".claude/commands/")) {
    if (lines > MAX_COMMAND_LINES) {
      return {
        validator: "command-file",
        passed: false,
        message: `Command file exceeds ${MAX_COMMAND_LINES} lines (${lines}). Split into smaller commands.`
      };
    }
    return { validator: "command-file", passed: true };
  }
  if (normalized.includes(".claude/skills/")) {
    if (lines > MAX_SKILL_LINES) {
      return {
        validator: "command-file",
        passed: false,
        message: `Skill file exceeds ${MAX_SKILL_LINES} lines (${lines}). Simplify the skill.`
      };
    }
    return { validator: "command-file", passed: true };
  }
  return { validator: "command-file", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/complexity.ts
var MAX_FILE_LINES = 500;
function validateComplexity(input) {
  if (process.env.COMPLEXITY_WARNING_SKIP === "1") return createSkipResult("complexity");
  const filePath = getFilePath(input);
  const content = getContent(input);
  if (!content || !filePath) return { validator: "complexity", passed: true };
  const hasExtension = /\.[^/]+$/.test(filePath);
  if (hasExtension && !/\.(ts|tsx|js|jsx)$/.test(filePath)) return { validator: "complexity", passed: true };
  const lines = content.split("\n").length;
  if (lines > MAX_FILE_LINES) {
    return {
      validator: "complexity",
      passed: true,
      message: `Warning: File has ${lines} lines (>${MAX_FILE_LINES}). Consider splitting.`
    };
  }
  return { validator: "complexity", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/dangerous-commands.ts
var VALIDATOR_NAME = "dangerous-commands";
var DANGEROUS_PATTERNS = [
  { pattern: /\bgit\s+push\s+.*--force\b/, description: "git push --force can overwrite remote history" },
  { pattern: /\bgit\s+push\s+-f\b/, description: "git push -f can overwrite remote history" },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/(?:\s|$)/,
    description: "rm -rf / is catastrophically destructive"
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+~(?:\s|$|\/\s)/,
    description: "rm -rf ~ deletes entire home directory"
  },
  { pattern: /\bgit\s+reset\s+--hard\b/, description: "git reset --hard discards uncommitted changes" },
  { pattern: /\bgit\s+clean\s+.*-f/, description: "git clean -f deletes untracked files permanently" },
  { pattern: /\bmkfs\b/, description: "mkfs formats filesystems" },
  { pattern: /\bdd\s+.*of=\/dev\//, description: "dd to device can overwrite disk" }
];
function validateDangerousCommands(input) {
  if (process.env.DANGEROUS_COMMANDS_SKIP === "1") return createSkipResult(VALIDATOR_NAME);
  if (!isBashInput(input)) return createSkipResult(VALIDATOR_NAME, "Not a Bash command");
  const command = getCommand(input);
  if (!command) return { validator: VALIDATOR_NAME, passed: true };
  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { validator: VALIDATOR_NAME, passed: false, message: `"${command}" \u2192 ${description}` };
    }
  }
  return { validator: VALIDATOR_NAME, passed: true };
}

// ../agent-kit/src/hooks/shared/validators/docs-governance.ts
var ALLOWED_ROOT_FILES = /* @__PURE__ */ new Set(["docs/README.md", "docs/FILE-TYPE-TAXONOMY.md"]);
function validateDocsGovernance(input, skipEnvVar = "DOCS_GOVERNANCE_SKIP") {
  const filePath = getFilePath(input);
  if (typeof process !== "undefined" && process.env?.[skipEnvVar] === "1") {
    return { validator: "docs-governance", passed: true, skipped: true, skipReason: "Bypass enabled" };
  }
  if (!filePath) return { validator: "docs-governance", passed: true };
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  if (!normalized.startsWith("docs/")) return { validator: "docs-governance", passed: true };
  if (!normalized.endsWith(".md")) return { validator: "docs-governance", passed: true };
  const isRootLevel = /^docs\/[^/]+\.md$/.test(normalized);
  if (isRootLevel && !ALLOWED_ROOT_FILES.has(normalized)) {
    return {
      validator: "docs-governance",
      passed: false,
      message: `Root docs/*.md files must be README.md or FILE-TYPE-TAXONOMY.md. Got: ${normalized}`
    };
  }
  return { validator: "docs-governance", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/path-contract.ts
var BLUEPRINTS_ROOT = "webpresso/blueprints";
var TECH_DEBT_ROOT = "webpresso/tech-debt";
var BLUEPRINT_STATUSES = /* @__PURE__ */ new Set([
  "draft",
  "planned",
  "parked",
  "in-progress",
  "completed",
  "archived"
]);
var KEBAB_CASE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function normalizePlanningPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\//, "");
}
function isBlueprintPath(filePath) {
  const normalized = normalizePlanningPath(filePath);
  return normalized === BLUEPRINTS_ROOT || normalized.startsWith(`${BLUEPRINTS_ROOT}/`);
}
function getNonCanonicalPlanningPathViolation(filePath) {
  const normalized = normalizePlanningPath(filePath);
  if (normalized === BLUEPRINTS_ROOT || normalized.startsWith(`${BLUEPRINTS_ROOT}/`) || normalized === TECH_DEBT_ROOT || normalized.startsWith(`${TECH_DEBT_ROOT}/`)) {
    return null;
  }
  if (!normalized.endsWith(".md")) return null;
  const parts = normalized.split("/");
  if (parts.length < 2) return null;
  const secondSegment = parts[1];
  if (secondSegment === "blueprints" || secondSegment === "tech-debt" || secondSegment === "plan-history") {
    return `Planning markdown must live under ${BLUEPRINTS_ROOT}/ or ${TECH_DEBT_ROOT}/. Got: ${normalized}`;
  }
  if (parts[0] === "platform") {
    return `Legacy planning paths under platform/* are no longer supported. Move blueprints to ${BLUEPRINTS_ROOT}/.`;
  }
  return null;
}
function isCanonicalBlueprintOverviewPath(filePath) {
  const normalized = normalizePlanningPath(filePath);
  const parts = normalized.split("/");
  return parts.length === 5 && parts[0] === "webpresso" && parts[1] === "blueprints" && BLUEPRINT_STATUSES.has(parts[2] ?? "") && KEBAB_CASE_SEGMENT.test(parts[3] ?? "") && parts[4] === "_overview.md";
}
function getBlueprintPathViolation(filePath) {
  const normalized = normalizePlanningPath(filePath);
  if (!isBlueprintPath(normalized)) return null;
  if (normalized.endsWith("/_overview.md") && !isCanonicalBlueprintOverviewPath(normalized)) {
    return `Blueprint overview files must live at webpresso/blueprints/<status>/<slug>/_overview.md. Got: ${normalized}`;
  }
  const parts = normalized.split("/");
  if (parts.length === 4 && parts[0] === "webpresso" && parts[1] === "blueprints" && BLUEPRINT_STATUSES.has(parts[2] ?? "") && normalized.endsWith(".md")) {
    return `Blueprint markdown files cannot live directly under a status directory. Move this file to webpresso/blueprints/${parts[2]}/<slug>/_overview.md or place supporting docs inside webpresso/blueprints/${parts[2]}/<slug>/. Got: ${normalized}`;
  }
  return null;
}

// ../agent-kit/src/hooks/pretool-guard/validators/file-conventions.ts
var SYSTEM_PATH_PREFIXES = ["/etc/", "/usr/", "/bin/", "/sbin/", "/var/", "/sys/", "/proc/", "/dev/"];
function validateNotSystemPath(filePath) {
  if (!filePath.startsWith("/")) return void 0;
  for (const prefix of SYSTEM_PATH_PREFIXES) {
    if (filePath.startsWith(prefix) || filePath === prefix.slice(0, -1)) {
      return { validator: "file-conventions", passed: false, message: `Cannot write to system path: ${filePath}` };
    }
  }
  return void 0;
}
function validateFileConventions(input) {
  if (process.env.FILE_CONVENTIONS_SKIP === "1") return createSkipResult("file-conventions");
  const filePath = getFilePath(input);
  if (!filePath) return { validator: "file-conventions", passed: true };
  const systemPathResult = validateNotSystemPath(filePath);
  if (systemPathResult) return systemPathResult;
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  if (/\/generated\//.test(filePath)) {
    return {
      validator: "file-conventions",
      passed: false,
      message: `Cannot edit files inside generated/ directories. These are auto-generated and should not be modified manually.`
    };
  }
  const nonCanonicalPlanningViolation = getNonCanonicalPlanningPathViolation(normalized);
  if (nonCanonicalPlanningViolation) {
    return { validator: "file-conventions", passed: false, message: nonCanonicalPlanningViolation };
  }
  const blueprintPathViolation = getBlueprintPathViolation(normalized);
  if (blueprintPathViolation) {
    return { validator: "file-conventions", passed: false, message: blueprintPathViolation };
  }
  if (!isBlueprintPath(normalized) || normalized.endsWith(".md")) {
    return { validator: "file-conventions", passed: true };
  }
  const parts = normalized.split("/");
  const planDir = parts[3];
  if (planDir && !/^[a-z0-9-]+$/.test(planDir)) {
    return {
      validator: "file-conventions",
      passed: false,
      message: `Implementation plan directories must be kebab-case. Got: ${planDir}`
    };
  }
  return { validator: "file-conventions", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/forbidden-commands.ts
var VALIDATOR_NAME2 = "forbidden-commands";
var SKIP_ENV_VAR = "FORBIDDEN_COMMANDS_SKIP";
var AUDIT_MODE_ENV = "FORBIDDEN_COMMANDS_AUDIT";
var DOCS_REF = 'AGENTS.md "Forbidden Commands (CRITICAL)" section';
var DB_HINT = "just db-push (or just db-migrate, just db-generate)";
var LINT_BASE = "just lint --package <name> (or --file <path>)";
var LINT_HINT = `${LINT_BASE} [--fix] [--fix-unsafe]`;
var FORMAT_HINT = "just format (or just format-check)";
var TEST_HINT = "just test --package <name> (or --file <path>)";
var MUTATION_HINT = "just test --mutation --package <name>";
var TYPECHECK_HINT = "just typecheck --package <name> (or --file <path>)";
var ENV_HINT = "just run <cmd> (injects secrets/env automatically)";
var JUST_TASK_TARGET_HINT = "just <task> [target] \u2014 check justfile for existing recipes, or add a new one";
var EXEC_RUNNERS = ["pnpm exec", "pnpx", "bunx"];
var DIRECT_RUNNERS = ["pnpm", "bun run", "bun"];
var SCRIPT_RUNNERS = ["pnpm run", "pnpm", "npm run", "npm", "bun run", "bun"];
var BLOCKED_TOOLS = [
  { tool: "drizzle-kit", category: "unknown", suggestion: DB_HINT, runners: ["exec", "direct", "bare"] },
  { tool: "vitest", category: "test", suggestion: TEST_HINT, runners: ["exec", "direct", "bare"] },
  { tool: "oxlint", category: "lint", suggestion: LINT_HINT, runners: ["exec", "direct", "bare"] },
  { tool: "oxfmt", category: "lint", suggestion: FORMAT_HINT, runners: ["exec", "direct", "bare"] },
  { tool: "stryker", category: "test", suggestion: MUTATION_HINT, runners: ["exec", "bare"] },
  { tool: "tsc", category: "typecheck", suggestion: TYPECHECK_HINT, runners: ["exec", "direct", "bare"] },
  { tool: "tsgo", category: "typecheck", suggestion: TYPECHECK_HINT, runners: ["exec", "direct", "bare"] }
];
var BLOCKED_SCRIPTS = [
  { script: "test", category: "test", suggestion: TEST_HINT },
  { script: "lint", category: "lint", suggestion: LINT_HINT },
  { script: "typecheck", category: "typecheck", suggestion: TYPECHECK_HINT }
];
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildToolPattern(prefix, tool) {
  const escaped = prefix ? `${escapeRegex(prefix)} ${escapeRegex(tool)}` : escapeRegex(tool);
  return new RegExp(`^${escaped}(\\s|$)`);
}
function generateRules() {
  const rules = [];
  for (const spec of BLOCKED_TOOLS) {
    if (spec.runners.includes("exec")) {
      for (const runner of EXEC_RUNNERS) {
        rules.push({ pattern: buildToolPattern(runner, spec.tool), category: spec.category, suggestion: spec.suggestion });
      }
    }
    if (spec.runners.includes("direct")) {
      for (const runner of DIRECT_RUNNERS) {
        rules.push({ pattern: buildToolPattern(runner, spec.tool), category: spec.category, suggestion: spec.suggestion });
      }
    }
    if (spec.runners.includes("bare")) {
      rules.push({ pattern: buildToolPattern("", spec.tool), category: spec.category, suggestion: spec.suggestion });
    }
  }
  for (const spec of BLOCKED_SCRIPTS) {
    for (const runner of SCRIPT_RUNNERS) {
      rules.push({ pattern: buildToolPattern(runner, spec.script), category: spec.category, suggestion: spec.suggestion });
    }
  }
  rules.push(
    { pattern: /^doppler run/, category: "unknown", suggestion: ENV_HINT },
    { pattern: /^DATABASE_URL=/, category: "unknown", suggestion: ENV_HINT },
    { pattern: /^pnpm exec\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^pnpm run\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npm exec\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npm run\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^bun run\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^npx\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^pnpx\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT },
    { pattern: /^bunx\b/, category: "unknown", suggestion: JUST_TASK_TARGET_HINT }
  );
  return rules;
}
var COMMAND_RULES = generateRules();
var SUGGESTION_MODIFIERS = [
  { pattern: /--fix-dangerous|--write.*--unsafe|--unsafe.*--write/, category: "lint", suggestion: `${LINT_BASE} --fix-unsafe` },
  { pattern: /--fix|--write/, category: "lint", suggestion: `${LINT_BASE} --fix` }
];
var COMMAND_DELIMITER_REGEX = /(?:&&|\|\||\||;)/;
var LOGICAL_OPERATOR_REGEX = /(?:&&|\|\||;)/;
function findMatchingRule(command) {
  for (const variant of getCommandVariants(command)) {
    const rule = COMMAND_RULES.find((r) => r.pattern.test(variant));
    if (rule) return rule;
  }
  return void 0;
}
function applySuggestionModifiers(command, rule) {
  for (const modifier of SUGGESTION_MODIFIERS) {
    if (modifier.category === rule.category && modifier.pattern.test(command)) return modifier.suggestion;
  }
  return rule.suggestion;
}
function getCommandVariants(command) {
  const normalized = command.trim();
  const variants = normalized ? [normalized] : [];
  if (normalized.startsWith("just ")) {
    const logicalSegments = normalized.split(LOGICAL_OPERATOR_REGEX).map((s) => s.trim()).filter(Boolean);
    for (const segment of logicalSegments) {
      const beforePipe = segment.split(/\s*\|\s*/)[0]?.trim();
      if (beforePipe && beforePipe !== segment && !variants.includes(beforePipe)) variants.push(beforePipe);
      if (segment !== normalized && !variants.includes(segment)) variants.push(segment);
    }
  } else {
    const segments = normalized.split(COMMAND_DELIMITER_REGEX).map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      if (!variants.includes(segment)) variants.push(segment);
    }
  }
  return variants;
}
function createBlockedResult(command, rule) {
  const suggestion = applySuggestionModifiers(command, rule);
  return {
    validator: VALIDATOR_NAME2,
    passed: false,
    message: `"${command}" \u2192 Use: ${suggestion}`,
    command,
    suggestion,
    category: rule.category,
    docsRef: DOCS_REF,
    matchedPattern: rule.pattern.source
  };
}
function createAuditResult(command, rule) {
  const suggestion = applySuggestionModifiers(command, rule);
  return {
    validator: VALIDATOR_NAME2,
    passed: true,
    message: `[AUDIT] Would block: "${command}" \u2192 ${suggestion}`,
    command,
    suggestion,
    category: rule.category,
    docsRef: DOCS_REF,
    matchedPattern: rule.pattern.source
  };
}
function validateForbiddenCommands(input) {
  if (process.env[SKIP_ENV_VAR] === "1") return createSkipResult(VALIDATOR_NAME2);
  if (!isBashInput(input)) return createSkipResult(VALIDATOR_NAME2, "Not a Bash command");
  const command = getCommand(input);
  if (!command) return createSkipResult(VALIDATOR_NAME2, "No command found");
  const rule = findMatchingRule(command);
  if (rule) {
    if (process.env[AUDIT_MODE_ENV] === "1") return createAuditResult(command, rule);
    return createBlockedResult(command, rule);
  }
  return { validator: VALIDATOR_NAME2, passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/package-imports.ts
var VALIDATOR_NAME3 = "package-imports";
var SKIP_ENV_VAR2 = "PACKAGE_IMPORTS_SKIP";
var SHARED_FUNCTIONS = [
  { name: "capitalize", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "truncate", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "slugify", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "toTitleCase", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "toKebabCase", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "toCamelCase", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "toSnakeCase", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "removeSpecialChars", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "getInitials", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "maskEmail", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "countWords", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "containsIgnoreCase", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "randomString", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "levenshteinDistance", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "closestMatch", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "findClosestMatch", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "escapeRegex", package: "@webpresso/utils", source: "string", category: "string" },
  { name: "formatBytes", package: "@webpresso/utils", source: "format", category: "format" },
  { name: "formatNumber", package: "@webpresso/utils", source: "format", category: "format" },
  { name: "formatPercentage", package: "@webpresso/utils", source: "format", category: "format" },
  { name: "formatPhoneNumber", package: "@webpresso/utils", source: "format", category: "format" },
  { name: "formatDate", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "formatRelativeTime", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "addDays", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "subtractDays", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "isToday", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "isWithinDays", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "startOfDay", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "endOfDay", package: "@webpresso/utils", source: "date", category: "date" },
  { name: "formatDuration", package: "@webpresso/utils", source: "duration", category: "duration" },
  { name: "generateId", package: "@webpresso/utils", source: "id", category: "id" },
  { name: "generateSlug", package: "@webpresso/utils", source: "id", category: "id" },
  { name: "generateSlugUnderscore", package: "@webpresso/utils", source: "id", category: "id" },
  { name: "getErrorMessage", package: "@webpresso/utils", source: "errors", category: "error" },
  { name: "serializeError", package: "@webpresso/utils", source: "errors", category: "error" },
  { name: "toError", package: "@webpresso/utils", source: "errors", category: "error" },
  { name: "isRetryableError", package: "@webpresso/utils", source: "errors", category: "error" },
  { name: "createErrorContext", package: "@webpresso/utils", source: "errors", category: "error" }
];
var IMPL_PATTERN = (name) => new RegExp(`(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function|\\())`, "m");
function validatePackageImports(input) {
  if (process.env[SKIP_ENV_VAR2] === "1") return createSkipResult(VALIDATOR_NAME3);
  const filePath = getFilePath(input);
  const content = getContent(input);
  if (!content || !filePath) return { validator: VALIDATOR_NAME3, passed: true };
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return { validator: VALIDATOR_NAME3, passed: true };
  if (SHARED_FUNCTIONS.some((fn) => filePath.includes(`/${fn.source}/`) || filePath.includes(`/${fn.package.replace("@", "").replace("/", "-")}/`))) {
    return { validator: VALIDATOR_NAME3, passed: true };
  }
  for (const fn of SHARED_FUNCTIONS) {
    if (IMPL_PATTERN(fn.name).test(content)) {
      const importPath = fn.source ? `${fn.package}/${fn.source}` : fn.package;
      return {
        validator: VALIDATOR_NAME3,
        passed: false,
        message: `Local implementation of "${fn.name}" detected. Import from ${importPath} instead.`,
        functionName: fn.name,
        suggestion: `import { ${fn.name} } from '${importPath}'`,
        package: fn.package,
        source: fn.source
      };
    }
  }
  return { validator: VALIDATOR_NAME3, passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/plan-frontmatter.ts
var VALID_TYPES = ["blueprint", "parent-roadmap"];
var VALID_STATUSES = ["draft", "planned", "parked", "in-progress", "completed", "archived"];
var VALID_COMPLEXITIES = ["XS", "S", "M", "L", "XL"];
function shouldValidatePath(filePath) {
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const nonCanonicalPlanningPath = getNonCanonicalPlanningPathViolation(normalized);
  const currentPath = isBlueprintPath(normalized);
  const isOverviewFile = normalized.endsWith("/README.md") || normalized.endsWith("/_overview.md");
  return !nonCanonicalPlanningPath && currentPath && isOverviewFile;
}
function extractFrontmatterBlock(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? null;
}
function parseFrontmatter(yamlBlock) {
  try {
    const result = jsYaml.load(yamlBlock);
    if (typeof result === "object" && result !== null) return result;
    return null;
  } catch {
    return null;
  }
}
function validateField(value, fieldName, validValues) {
  if (value === void 0) return { field: fieldName, message: `Missing required field: ${fieldName}` };
  if (typeof value !== "string" || !validValues.includes(value)) {
    return { field: fieldName, message: `Invalid ${fieldName}: "${value}". Valid values: ${validValues.join(", ")}` };
  }
  return null;
}
function collectFieldViolations(data) {
  const violations = [];
  const typeViolation = validateField(data.type, "type", VALID_TYPES);
  if (typeViolation) violations.push(typeViolation);
  const statusViolation = validateField(data.status, "status", VALID_STATUSES);
  if (statusViolation) violations.push(statusViolation);
  const complexityViolation = validateField(data.complexity, "complexity", VALID_COMPLEXITIES);
  if (complexityViolation) violations.push(complexityViolation);
  return violations;
}
function countTaskHeadings(content) {
  return content.match(/^####\s+Task\s+\d+(?:\.\d+)+:/gm)?.length ?? 0;
}
function detectWrongTaskFormat(content) {
  return content.match(/^###\s+Task\s+\d+(?:\.\d+)+:/gm)?.length ?? 0;
}
function validatePlanFrontmatter(input) {
  const filePath = getFilePath(input);
  if (process.env.PLAN_FRONTMATTER_SKIP === "1") return createSkipResult("plan-frontmatter");
  if (!filePath || !shouldValidatePath(filePath)) {
    if (filePath) {
      const planningPathViolation = getNonCanonicalPlanningPathViolation(filePath);
      if (planningPathViolation) return { validator: "plan-frontmatter", passed: false, message: planningPathViolation };
    }
    return { validator: "plan-frontmatter", passed: true };
  }
  if (input.tool_input?.old_string !== void 0) return { validator: "plan-frontmatter", passed: true };
  const content = getContent(input);
  if (!content) return { validator: "plan-frontmatter", passed: true };
  const yamlBlock = extractFrontmatterBlock(content);
  if (!yamlBlock) {
    return { validator: "plan-frontmatter", passed: false, message: "Missing YAML frontmatter block (expected --- at start of file)" };
  }
  const data = parseFrontmatter(yamlBlock);
  if (!data) {
    return { validator: "plan-frontmatter", passed: false, message: "Invalid YAML in frontmatter block" };
  }
  const violations = [...collectFieldViolations(data)];
  const wrongFormatCount = detectWrongTaskFormat(content);
  if (wrongFormatCount > 0) {
    violations.push({ field: "task_format", message: `Found ${wrongFormatCount} task heading(s) with wrong format (use "#### Task X.Y:" not "### Task X.Y:")` });
  }
  if (violations.length > 0) {
    const preview = violations.slice(0, 4).map((v) => `  ${v.field}: ${v.message}`);
    const overflow = violations.length > 4 ? `
  ...and ${violations.length - 4} more issues` : "";
    return { validator: "plan-frontmatter", passed: false, message: `Blueprint validation failed:
${preview.join("\n")}${overflow}` };
  }
  const taskCount = countTaskHeadings(content);
  if (taskCount === 0) {
    return { validator: "plan-frontmatter", passed: true, message: 'Warning: no task headings found (expected "#### Task X.Y:" format)' };
  }
  return { validator: "plan-frontmatter", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/test-quality.ts
var MUTATION_GAMING_PATTERNS = [
  { pattern: /mutation[_-]kill/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /kill[_-]mutant/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /for[_-]coverage/i, description: "File name suggests coverage gaming", fileLevel: true },
  { pattern: /increase[_-]mutation/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /describe\s*\(\s*['"`].*mutation[_-]kill/i, description: "Test suite name suggests mutation gaming" },
  { pattern: /describe\s*\(\s*['"`].*kill[_-]mutant/i, description: "Test suite name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*kill\s+(the\s+)?mutant/i, description: "Test name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*for\s+mutation\s+score/i, description: "Test name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*increase\s+(mutation|coverage)/i, description: "Test name suggests coverage gaming" }
];
var TAUTOLOGICAL_PATTERNS = [
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/, description: "expect(true).toBe(true)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBe\s*\(\s*false\s*\)/, description: "expect(false).toBe(false)" },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toEqual\s*\(\s*true\s*\)/, description: "expect(true).toEqual(true)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toEqual\s*\(\s*false\s*\)/, description: "expect(false).toEqual(false)" },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toBe\s*\(\s*null\s*\)/, description: "expect(null).toBe(null)" },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toBe\s*\(\s*undefined\s*\)/, description: "expect(undefined).toBe(undefined)" },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toEqual\s*\(\s*null\s*\)/, description: "expect(null).toEqual(null)" },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toEqual\s*\(\s*undefined\s*\)/, description: "expect(undefined).toEqual(undefined)" },
  { pattern: /expect\s*\(\s*\[\s*\]\s*\)\s*\.toEqual\s*\(\s*\[\s*\]\s*\)/, description: "expect([]).toEqual([])" },
  { pattern: /expect\s*\(\s*\{\s*\}\s*\)\s*\.toEqual\s*\(\s*\{\s*\}\s*\)/, description: "expect({}).toEqual({})" },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: "expect(true).toBeTruthy()" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: "expect(false).toBeFalsy()" },
  { pattern: /expect\s*\(\s*1\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: "expect(1).toBeTruthy()" },
  { pattern: /expect\s*\(\s*0\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: "expect(0).toBeFalsy()" },
  { pattern: /expect\s*\(\s*["'][^"']+["']\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: 'expect("string").toBeTruthy()' },
  { pattern: /expect\s*\(\s*["']["']\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: 'expect("").toBeFalsy()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(true).toBeDefined()" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(false).toBeDefined()" },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(number).toBeDefined()" },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect("string").toBeDefined()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(true).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(false).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(number).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect("string").toBeInstanceOf(Object)' }
];
function findTautologicalAssertions(content) {
  const lines = content.split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, description } of TAUTOLOGICAL_PATTERNS) {
      const match = line.match(pattern);
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] });
    }
  }
  return matches;
}
function findMutationGamingPatterns(content, filePath) {
  const matches = [];
  if (filePath) {
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (!fileLevel) continue;
      const match = filePath.match(pattern);
      if (match) matches.push({ line: 0, pattern: description, match: match[0] });
    }
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (fileLevel) continue;
      const match = line.match(pattern);
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] });
    }
  }
  return matches;
}
function validateTestQuality(input) {
  const filePath = getFilePath(input);
  const content = getContent(input);
  if (!content || !filePath) return { validator: "test-quality", passed: true };
  if (!/\.test\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return { validator: "test-quality", passed: true, skipped: true, skipReason: "Not a test file" };
  }
  if (filePath.includes("test-quality.test.ts")) {
    return { validator: "test-quality", passed: true, skipped: true, skipReason: "Validator self-test" };
  }
  const gamingMatches = findMutationGamingPatterns(content, filePath);
  if (gamingMatches.length > 0) {
    const examples = gamingMatches.slice(0, 3).map((m) => m.line === 0 ? `  File path: ${m.pattern}` : `  Line ${m.line}: ${m.pattern}`);
    return {
      validator: "test-quality",
      passed: false,
      message: `Mutation gaming detected:
${examples.join("\n")}${gamingMatches.length > 3 ? `
  ...and ${gamingMatches.length - 3} more` : ""}`
    };
  }
  const matches = findTautologicalAssertions(content);
  if (matches.length > 0) {
    const examples = matches.slice(0, 3).map((m) => `  Line ${m.line}: ${m.pattern}`);
    return {
      validator: "test-quality",
      passed: false,
      message: `Tautological assertions detected:
${examples.join("\n")}${matches.length > 3 ? `
  ...and ${matches.length - 3} more` : ""}`
    };
  }
  return { validator: "test-quality", passed: true };
}

// ../agent-kit/src/hooks/pretool-guard/validators/ux-quality.ts
var VALIDATOR_NAME4 = "ux-quality";
var ALERT_PATTERN = /\b(?:window\.)?alert\s*\(/g;
var CATCH_CONSOLE_ERROR_ONLY_PATTERN = /catch\s*(?:\([^)]*\))?\s*\{\s*console\.error\s*\([\s\S]*?\)\s*;?\s*\}/g;
var USE_QUERY_DESTRUCTURE_PATTERN = /const\s*\{([^}]*)\}\s*=\s*useQuery\s*\(/g;
var USE_QUERY_ASSIGNMENT_PATTERN = /(?:const|let|var)\s+\w+\s*=\s*useQuery\s*\(/g;
function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}
function collectAlertViolations(content) {
  const violations = [];
  for (const match of content.matchAll(ALERT_PATTERN)) {
    const text = match[0] === "window.alert(" ? "window.alert()" : "alert()";
    violations.push({ line: getLineNumber(content, match.index ?? 0), message: `Avoid ${text}; use non-blocking UI feedback instead.` });
  }
  return violations;
}
function collectCatchViolations(content) {
  const violations = [];
  for (const match of content.matchAll(CATCH_CONSOLE_ERROR_ONLY_PATTERN)) {
    violations.push({ line: getLineNumber(content, match.index ?? 0), message: "catch block only logs with console.error; add user-facing handling and recovery." });
  }
  return violations;
}
function buildMissingFieldsMessage(hasIsPending, hasIsError) {
  const missing = [hasIsPending ? null : "isPending", hasIsError ? null : "isError"].filter((name) => Boolean(name)).join(" and ");
  return `useQuery destructuring must include ${missing}.`;
}
function collectUseQueryViolations(content) {
  const violations = [];
  for (const match of content.matchAll(USE_QUERY_DESTRUCTURE_PATTERN)) {
    const fields = match[1] || "";
    const hasIsPending = /\bisPending\b/.test(fields);
    const hasIsError = /\bisError\b/.test(fields);
    if (!hasIsPending || !hasIsError) {
      violations.push({ line: getLineNumber(content, match.index ?? 0), message: buildMissingFieldsMessage(hasIsPending, hasIsError) });
    }
  }
  for (const match of content.matchAll(USE_QUERY_ASSIGNMENT_PATTERN)) {
    violations.push({ line: getLineNumber(content, match.index ?? 0), message: "useQuery result must handle isPending and isError states." });
  }
  return violations;
}
function validateUxQuality(input) {
  const filePath = getFilePath(input);
  const content = getContent(input);
  if (!filePath || !content) return { validator: VALIDATOR_NAME4, passed: true };
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return { validator: VALIDATOR_NAME4, passed: true };
  const violations = [
    ...collectAlertViolations(content),
    ...collectCatchViolations(content),
    ...collectUseQueryViolations(content)
  ];
  if (!violations.length) return { validator: VALIDATOR_NAME4, passed: true };
  const preview = violations.slice(0, 4).map((v) => `  Line ${v.line}: ${v.message}`);
  const overflow = violations.length > 4 ? `
  ...and ${violations.length - 4} more` : "";
  return {
    validator: VALIDATOR_NAME4,
    passed: false,
    message: `UX anti-patterns detected:
${preview.join("\n")}${overflow}`
  };
}

// ../agent-kit/src/hooks/pretool-guard/validators/index.ts
var VALIDATORS = [
  validateForbiddenCommands,
  validateDangerousCommands,
  validateBlueprint2,
  validateDocsGovernance,
  validatePlanFrontmatter,
  validateComplexity,
  validatePackageImports,
  validateFileConventions,
  validateCommandFile,
  validateTestQuality,
  validateUxQuality
];

// ../agent-kit/src/hooks/pretool-guard/runner.ts
var RED = "\x1B[31m";
var YELLOW = "\x1B[33m";
var DIM = "\x1B[2m";
var BOLD = "\x1B[1m";
var NC = "\x1B[0m";
function runAllValidators(input) {
  const results = VALIDATORS.map((v) => v(input));
  const failed = results.filter((r) => !r.passed);
  return { passed: !failed.length, results, exitCode: failed.length ? 2 : 0 };
}
function formatOutput(aggregate, input) {
  const filePath = getFilePath(input) || "unknown";
  if (!aggregate.passed) {
    const failed = aggregate.results.filter((r) => !r.passed);
    console.error(`${BOLD}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${NC}`);
    console.error(`${RED}\u274C Pretool Guard: BLOCKED${NC}`);
    console.error(`${RED}   File: ${filePath}${NC}`);
    console.error(`${BOLD}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${NC}`);
    for (const result of failed) {
      console.error(`${RED}   \u2022 [${result.validator}] ${result.message || "Validation failed"}${NC}`);
    }
    console.error(`${BOLD}\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501${NC}`);
    return;
  }
  const warnings = aggregate.results.filter((r) => r.passed && r.message);
  for (const warning of warnings) {
    console.error(`${YELLOW}\u26A0\uFE0F  [${warning.validator}] ${warning.message}${NC}`);
  }
  if (process.env.PRETOOL_VERBOSE === "1") {
    const skipped = aggregate.results.filter((r) => r.skipped);
    for (const skip of skipped) {
      console.error(`${DIM}\u23ED\uFE0F  [${skip.validator}] Skipped: ${skip.skipReason}${NC}`);
    }
    console.error(`${DIM}\u2705 Pretool Guard: PASSED${NC}`);
  }
  console.log("{}");
}
function getToolType(input) {
  if (isBashInput(input)) return "Bash";
  if (getFilePath(input)) return "Write";
  return "Edit";
}
function getTarget(input) {
  return getFilePath(input) || getCommand(input) || "unknown";
}
function logValidationResult(result, target, tool) {
  if (!result.passed) {
    const failed = result.results.filter((r) => !r.passed);
    logRun({ status: "BLOCK", target: target.slice(0, 100), tool, failures: failed.map((f) => f.validator) });
    return;
  }
  const warnings = result.results.filter((r) => r.passed && r.message);
  logRun({ status: warnings.length > 0 ? "WARN" : "PASS", target: target.slice(0, 100), tool, failures: warnings.length > 0 ? warnings.map((w) => w.validator) : void 0 });
}
function handleParseError(error, inputJson) {
  logRun({ status: "ERROR", target: inputJson.slice(0, 50).replace(/\n/g, " "), tool: "Bash", error: error instanceof Error ? error.message : String(error) });
  console.error(`${RED}\u274C Pretool Guard: Error parsing input${NC}`);
  console.error(`${RED}   ${error instanceof Error ? error.message : "Unknown error"}${NC}`);
  process.exit(2);
}
function writeDenyDecision(permissionDecisionReason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason
      }
    })
  );
}
function processValidation(inputJson, mcpReadyFn = isMcpReady) {
  if (!isGuardEnabled()) {
    console.log("{}");
    process.exit(0);
  }
  const input = parseToolInput(inputJson);
  const command = isBashInput(input) ? getCommand(input) : null;
  if (command) {
    const decision = routeCommand(command);
    if (decision !== null) {
      if (decision.action.action === "deny" && mcpReadyFn()) {
        writeDenyDecision(decision.action.guidance);
        process.exit(0);
      } else if (decision.action.action === "sandbox") {
        writeDenyDecision(decision.action.guidance);
        process.exit(0);
      }
    }
  }
  const target = getTarget(input);
  const tool = getToolType(input);
  const result = runAllValidators(input);
  logValidationResult(result, target, tool);
  formatOutput(result, input);
  process.exit(result.exitCode);
}
async function main() {
  suppressStderr();
  const inputJson = await readStdinJson();
  if (!inputJson.trim()) {
    console.log("{}");
    process.exit(0);
  }
  try {
    processValidation(inputJson);
  } catch (error) {
    handleParseError(error, inputJson);
  }
}
if (process.argv[1] && realpathSync2(fileURLToPath2(import.meta.url)) === realpathSync2(process.argv[1])) {
  main();
}

// ../agent-kit/src/hooks/pretool-guard/index.ts
if (process.argv[1] && realpathSync3(fileURLToPath3(import.meta.url)) === realpathSync3(process.argv[1])) {
  main();
}
export {
  VALIDATORS,
  getTarget,
  getToolType,
  handleParseError,
  logValidationResult,
  main,
  processValidation,
  runAllValidators
};
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
