import { ByteBuffer, resize, readVarint32, writeVarint32, calculateVarint32, readUint32 } from "./bytebuffer";
import { calculateUTF16asUTF8, decodeUTF8, UTF8toUTF16 } from "./utfx";

// types/strings/cstring

/**
 * Writes a NULL-terminated UTF8 encoded string. For this to work the specified string must not contain any NULL
 *  characters itself.
 * @param {string} str String to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  contained in `str` + 1 if omitted.
 * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written
 * @expose
 */
export function writeCString(buf: ByteBuffer, str: string, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    let i,
        k = str.length;
    if (!buf.noAssert) {
        if (typeof str !== 'string')
            throw TypeError("Illegal str: Not a string");
        for (i = 0; i < k; ++i) {
            if (str.charCodeAt(i) === 0)
                throw RangeError("Illegal str: Contains NULL-characters");
        }
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    // UTF8 strings do not contain zero bytes in between except for the zero character, so:
    k = Buffer.byteLength(str, "utf8");
    offset += k + 1;
    let capacity12 = buf.buffer.length;
    if (offset > capacity12)
        resize(buf, (capacity12 *= 2) > offset ? capacity12 : offset);
    offset -= k + 1;
    offset += buf.buffer.write(str, offset, k, "utf8");
    buf.buffer[offset++] = 0;
    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return k;
};

/**
 * Reads a NULL-terminated UTF8 encoded string. For this to work the string read must not contain any NULL characters
 *  itself.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
 *  read and the actual number of bytes read.
 * @expose
 */
export function readCString(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    let start = offset,
        temp;
    // UTF8 strings do not contain zero bytes in between except for the zero character itself, so:
    do {
        if (offset >= buf.buffer.length)
            throw RangeError("Index out of range: " + offset + " <= " + buf.buffer.length);
        temp = buf.buffer[offset++];
    } while (temp !== 0);
    let str = buf.buffer.toString("utf8", start, offset - 1);
    if (relative) {
        buf.offset = offset;
        return str;
    } else {
        return {
            "string": str,
            "length": offset - start
        };
    }
};

// types/strings/istring

/**
 * Writes a length as uint32 prefixed UTF8 encoded string.
 * @param {string} str String to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} `this` if `offset` is omitted, else the actual number of bytes written
 * @expose
 * @see ByteBuffer#writeVarint32
 */
export function writeIString(buf: ByteBuffer, str: string, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof str !== 'string')
            throw TypeError("Illegal str: Not a string");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    let start = offset,
        k;
    k = Buffer.byteLength(str, "utf8");
    offset += 4 + k;
    let capacity13 = buf.buffer.length;
    if (offset > capacity13)
        resize(buf, (capacity13 *= 2) > offset ? capacity13 : offset);
    offset -= 4 + k;
    if (buf.littleEndian) {
        buf.buffer[offset + 3] = (k >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (k >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (k >>> 8) & 0xFF;
        buf.buffer[offset] = k & 0xFF;
    } else {
        buf.buffer[offset] = (k >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (k >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (k >>> 8) & 0xFF;
        buf.buffer[offset + 3] = k & 0xFF;
    }
    offset += 4;
    offset += buf.buffer.write(str, offset, k, "utf8");
    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return offset - start;
};

/**
 * Reads a length as uint32 prefixed UTF8 encoded string.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
 *  read and the actual number of bytes read.
 * @expose
 * @see ByteBuffer#readVarint32
 */
export function readIString(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 4 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + buf.buffer.length);
    }
    let start = offset;
    let len = readUint32(buf, offset);
    let str = readUTF8String(buf, len, METRICS_BYTES, offset += 4);
    offset += str['length'];
    if (relative) {
        buf.offset = offset;
        return str['string'];
    } else {
        return {
            'string': str['string'],
            'length': offset - start
        };
    }
};

// types/strings/utf8string

/**
 * Metrics representing number of UTF8 characters. Evaluates to `c`.
 * @type {string}
 * @const
 * @expose
 */
export const METRICS_CHARS = 'c';

/**
 * Metrics representing number of bytes. Evaluates to `b`.
 * @type {string}
 * @const
 * @expose
 */
export const METRICS_BYTES = 'b';

/**
 * Writes an UTF8 encoded string.
 * @param {string} str String to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} if omitted.
 * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
 * @expose
 */
export function writeUTF8String(buf: ByteBuffer, str: string, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    let k;
    k = Buffer.byteLength(str, "utf8");
    offset += k;
    let capacity14 = buf.buffer.length;
    if (offset > capacity14)
        resize(buf, (capacity14 *= 2) > offset ? capacity14 : offset);
    offset -= k;
    offset += buf.buffer.write(str, offset, k, "utf8");
    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return k;
};

/**
 * Writes an UTF8 encoded string. This is an alias of {@link ByteBuffer#writeUTF8String}.
 * @function
 * @param {string} str String to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} if omitted.
 * @returns {!ByteBuffer|number} this if offset is omitted, else the actual number of bytes written.
 * @expose
 */
export const writeString = writeUTF8String;

/**
 * Calculates the number of UTF8 characters of a string. JavaScript itself uses UTF-16, so that a string's
 *  `length` property does not reflect its actual UTF8 size if it contains code points larger than 0xFFFF.
 * @param {string} str String to calculate
 * @returns {number} Number of UTF8 characters
 * @expose
 */
export function calculateUTF8Chars(str: string) {
    return calculateUTF16asUTF8(stringSource(str))[0];
};

/**
 * Calculates the number of UTF8 bytes of a string.
 * @param {string} str String to calculate
 * @returns {number} Number of UTF8 bytes
 * @expose
 */
export function calculateUTF8Bytes(str: string) {
    if (typeof str !== 'string')
        throw TypeError("Illegal argument: " + (typeof str));
    return Buffer.byteLength(str, "utf8");
};

/**
 * Calculates the number of UTF8 bytes of a string. This is an alias of {@link calculateUTF8Bytes}.
 * @function
 * @param {string} str String to calculate
 * @returns {number} Number of UTF8 bytes
 * @expose
 */
export const calculateString = calculateUTF8Bytes;

/**
 * Reads an UTF8 encoded string.
 * @param {number} length Number of characters or bytes to read.
 * @param {string=} metrics Metrics specifying what `length` is meant to count. Defaults to
 *  {@link METRICS_CHARS}.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
 *  read and the actual number of bytes read.
 * @expose
 */
// export function readUTF8String(buf: ByteBuffer, length: number, metrics?: string, offset: number): number;
export function readUTF8String(buf: ByteBuffer, length: number, metrics: string | undefined, offset: number): { string: string; length: number };
export function readUTF8String(buf: ByteBuffer, length: number, metrics: string | undefined, offset: number | undefined): string | { string: string; length: number };
export function readUTF8String(buf: ByteBuffer, length: number, metrics?: string, offset?: number) {
    if (typeof metrics === 'number') {
        offset = metrics;
        metrics = undefined;
    }
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (typeof metrics === 'undefined') metrics = METRICS_CHARS;
    if (!buf.noAssert) {
        if (typeof length !== 'number' || length % 1 !== 0)
            throw TypeError("Illegal length: " + length + " (not an integer)");
        length |= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    let i = 0,
        start = offset,
        temp,
        sd: () => string | undefined;
    if (metrics === METRICS_CHARS) { // The same for node and the browser
        sd = stringDestination();
        decodeUTF8(function () {
            return i < length && offset! < buf.limit ? buf.buffer[offset!++] : null;
        }, function (cp) {
            ++i; UTF8toUTF16(cp, sd);
        });
        if (i !== length)
            throw RangeError("Illegal range: Truncated data, " + i + " == " + length);
        if (relative) {
            buf.offset = offset;
            return sd();
        } else {
            return {
                "string": sd(),
                "length": offset - start
            };
        }
    } else if (metrics === METRICS_BYTES) {
        if (!buf.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: " + offset + " (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + length > buf.buffer.length)
                throw RangeError("Illegal offset: 0 <= " + offset + " (+" + length + ") <= " + buf.buffer.length);
        }
        temp = buf.buffer.toString("utf8", offset, offset + length);
        if (relative) {
            buf.offset += length;
            return temp;
        } else {
            return {
                'string': temp,
                'length': length
            };
        }
    } else
        throw TypeError("Unsupported metrics: " + metrics);
};

/**
 * Reads an UTF8 encoded string. This is an alias of {@link ByteBuffer#readUTF8String}.
 * @function
 * @param {number} length Number of characters or bytes to read
 * @param {number=} metrics Metrics specifying what `n` is meant to count. Defaults to
 *  {@link METRICS_CHARS}.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
 *  read and the actual number of bytes read.
 * @expose
 */
export const readString = readUTF8String;

// types/strings/vstring

/**
 * Writes a length as varint32 prefixed UTF8 encoded string.
 * @param {string} str String to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} `this` if `offset` is omitted, else the actual number of bytes written
 * @expose
 * @see ByteBuffer#writeVarint32
 */
export function writeVString(buf: ByteBuffer, str: string, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof str !== 'string')
            throw TypeError("Illegal str: Not a string");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    let start = offset,
        k, l;
    k = Buffer.byteLength(str, "utf8");
    l = calculateVarint32(k);
    offset += l + k;
    let capacity15 = buf.buffer.length;
    if (offset > capacity15)
        resize(buf, (capacity15 *= 2) > offset ? capacity15 : offset);
    offset -= l + k;
    offset += writeVarint32(buf, k, offset);
    offset += buf.buffer.write(str, offset, k, "utf8");
    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return offset - start;
};

/**
 * Reads a length as varint32 prefixed UTF8 encoded string.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {string|!{string: string, length: number}} The string read if offset is omitted, else the string
 *  read and the actual number of bytes read.
 * @expose
 * @see ByteBuffer#readVarint32
 */
export function readVString(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    let start = offset;
    let len = readVarint32(buf, offset);
    let str = readUTF8String(buf, len['value'], METRICS_BYTES, offset += len['length']);
    offset += str['length'];
    if (relative) {
        buf.offset = offset;
        return str['string'];
    } else {
        return {
            'string': str['string'],
            'length': offset - start
        };
    }
};

/**
 * String.fromCharCode reference for compile-time renaming.
 * @type {function(...number):string}
 * @inner
 */
export const stringFromCharCode = String.fromCharCode;

/**
 * Creates a source function for a string.
 * @param {string} s String to read from
 * @returns {function():number|null} Source function returning the next char code respectively `null` if there are
 *  no more characters left.
 * @throws {TypeError} If the argument is invalid
 * @inner
 */
function stringSource(s: string) {
    let i = 0; return function () {
        return i < s.length ? s.charCodeAt(i++) : null;
    };
}

/**
 * Creates a destination function for a string.
 * @returns {function(number=):undefined|string} Destination function successively called with the next char code.
 *  Returns the final string when called without arguments.
 * @inner
 */
function stringDestination() {
    let cs: number[] = [], ps: string[] = []; return function () {
        if (arguments.length === 0)
            return ps.join('') + stringFromCharCode.apply(String, cs);
        if (cs.length + arguments.length > 1024)
            ps.push(stringFromCharCode.apply(String, cs)),
                cs.length = 0;
        Array.prototype.push.apply(cs, arguments as any);
    };
}
