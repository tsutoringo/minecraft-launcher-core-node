import { ByteBuffer } from "./bytebuffer";

/**
 * A `Long` class for representing a 64-bit two's-complement integer value.
 * @type {!Long}
 * @const
 * @see https://npmjs.org/package/long
 * @expose
 */
export const Long: any = Long;

/**
 * Maximum number of bytes required to store a 64bit base 128 variable-length integer.
 * @type {number}
 * @const
 * @expose
 */
export const MAX_VARINT64_BYTES = 10;

/**
 * Writes a 64bit signed integer.
 * @param {number|!Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeInt64(buf: ByteBuffer, value: number, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value === 'number')
            value = Long.fromNumber(value);
        else if (typeof value === 'string')
            value = Long.fromString(value);
        else if (!(value && value instanceof Long))
            throw TypeError("Illegal value: " + value + " (not an integer or Long)");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    if (typeof value === 'number')
        value = Long.fromNumber(value);
    else if (typeof value === 'string')
        value = Long.fromString(value);
    offset += 8;
    var capacity6 = buf.buffer.length;
    if (offset > capacity6)
        resize(buf, (capacity6 *= 2) > offset ? capacity6 : offset);
    offset -= 8;
    var lo = value.low,
        hi = value.high;
    if (buf.littleEndian) {
        buf.buffer[offset + 3] = (lo >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (lo >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (lo >>> 8) & 0xFF;
        buf.buffer[offset] = lo & 0xFF;
        offset += 4;
        buf.buffer[offset + 3] = (hi >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (hi >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (hi >>> 8) & 0xFF;
        buf.buffer[offset] = hi & 0xFF;
    } else {
        buf.buffer[offset] = (hi >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (hi >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (hi >>> 8) & 0xFF;
        buf.buffer[offset + 3] = hi & 0xFF;
        offset += 4;
        buf.buffer[offset] = (lo >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (lo >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (lo >>> 8) & 0xFF;
        buf.buffer[offset + 3] = lo & 0xFF;
    }
    if (relative) buf.offset += 8;
    return this;
};

/**
 * Writes a 64bit signed integer. This is an alias of {@link ByteBuffer#writeInt64}.
 * @param {number|!Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeLong = writeInt64;

/**
 * Reads a 64bit signed integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!Long}
 * @expose
 */
export function readInt64(buf: ByteBuffer, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (relative) offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 8 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 8 + ") <= " + buf.buffer.length);
    }
    var lo = 0,
        hi = 0;
    if (buf.littleEndian) {
        lo = buf.buffer[offset + 2] << 16;
        lo |= buf.buffer[offset + 1] << 8;
        lo |= buf.buffer[offset];
        lo += buf.buffer[offset + 3] << 24 >>> 0;
        offset += 4;
        hi = buf.buffer[offset + 2] << 16;
        hi |= buf.buffer[offset + 1] << 8;
        hi |= buf.buffer[offset];
        hi += buf.buffer[offset + 3] << 24 >>> 0;
    } else {
        hi = buf.buffer[offset + 1] << 16;
        hi |= buf.buffer[offset + 2] << 8;
        hi |= buf.buffer[offset + 3];
        hi += buf.buffer[offset] << 24 >>> 0;
        offset += 4;
        lo = buf.buffer[offset + 1] << 16;
        lo |= buf.buffer[offset + 2] << 8;
        lo |= buf.buffer[offset + 3];
        lo += buf.buffer[offset] << 24 >>> 0;
    }
    var value = new Long(lo, hi, false);
    if (relative) buf.offset += 8;
    return value;
};

/**
 * Reads a 64bit signed integer. This is an alias of {@link ByteBuffer#readInt64}.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!Long}
 * @expose
 */
export const readLong = readInt64;

/**
 * Writes a 64bit unsigned integer.
 * @param {number|!Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeUint64(buf: ByteBuffer, value: number, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (relative) offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value === 'number')
            value = Long.fromNumber(value);
        else if (typeof value === 'string')
            value = Long.fromString(value);
        else if (!(value && value instanceof Long))
            throw TypeError("Illegal value: " + value + " (not an integer or Long)");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    if (typeof value === 'number')
        value = Long.fromNumber(value);
    else if (typeof value === 'string')
        value = Long.fromString(value);
    offset += 8;
    var capacity7 = buf.buffer.length;
    if (offset > capacity7)
        resize(buf, (capacity7 *= 2) > offset ? capacity7 : offset);
    offset -= 8;
    var lo = value.low,
        hi = value.high;
    if (buf.littleEndian) {
        buf.buffer[offset + 3] = (lo >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (lo >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (lo >>> 8) & 0xFF;
        buf.buffer[offset] = lo & 0xFF;
        offset += 4;
        buf.buffer[offset + 3] = (hi >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (hi >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (hi >>> 8) & 0xFF;
        buf.buffer[offset] = hi & 0xFF;
    } else {
        buf.buffer[offset] = (hi >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (hi >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (hi >>> 8) & 0xFF;
        buf.buffer[offset + 3] = hi & 0xFF;
        offset += 4;
        buf.buffer[offset] = (lo >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (lo >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (lo >>> 8) & 0xFF;
        buf.buffer[offset + 3] = lo & 0xFF;
    }
    if (relative) buf.offset += 8;
    return this;
};

/**
 * Writes a 64bit unsigned integer. This is an alias of {@link ByteBuffer#writeUint64}.
 * @function
 * @param {number|!Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeUInt64 = writeUint64;

/**
 * Reads a 64bit unsigned integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!Long}
 * @expose
 */
export function readUint64(buf: ByteBuffer, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (relative) offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 8 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 8 + ") <= " + buf.buffer.length);
    }
    var lo = 0,
        hi = 0;
    if (buf.littleEndian) {
        lo = buf.buffer[offset + 2] << 16;
        lo |= buf.buffer[offset + 1] << 8;
        lo |= buf.buffer[offset];
        lo += buf.buffer[offset + 3] << 24 >>> 0;
        offset += 4;
        hi = buf.buffer[offset + 2] << 16;
        hi |= buf.buffer[offset + 1] << 8;
        hi |= buf.buffer[offset];
        hi += buf.buffer[offset + 3] << 24 >>> 0;
    } else {
        hi = buf.buffer[offset + 1] << 16;
        hi |= buf.buffer[offset + 2] << 8;
        hi |= buf.buffer[offset + 3];
        hi += buf.buffer[offset] << 24 >>> 0;
        offset += 4;
        lo = buf.buffer[offset + 1] << 16;
        lo |= buf.buffer[offset + 2] << 8;
        lo |= buf.buffer[offset + 3];
        lo += buf.buffer[offset] << 24 >>> 0;
    }
    var value = new Long(lo, hi, true);
    if (relative) buf.offset += 8;
    return value;
};

/**
 * Reads a 64bit unsigned integer. This is an alias of {@link ByteBuffer#readUint64}.
 * @function
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!Long}
 * @expose
 */
export const readUInt64 = readUint64;

/**
 * Calculates the actual number of bytes required to store a 64bit base 128 variable-length integer.
 * @param {number|!Long} value Value to encode
 * @returns {number} Number of bytes required. Capped to {@link ByteBuffer.MAX_VARINT64_BYTES}
 * @expose
 */
export function calculateVarint64(value: number) {
    if (typeof value === 'number')
        value = Long.fromNumber(value);
    else if (typeof value === 'string')
        value = Long.fromString(value);
    // ref: src/google/protobuf/io/coded_stream.cc
    var part0 = value.toInt() >>> 0,
        part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
        part2 = value.shiftRightUnsigned(56).toInt() >>> 0;
    if (part2 == 0) {
        if (part1 == 0) {
            if (part0 < 1 << 14)
                return part0 < 1 << 7 ? 1 : 2;
            else
                return part0 < 1 << 21 ? 3 : 4;
        } else {
            if (part1 < 1 << 14)
                return part1 < 1 << 7 ? 5 : 6;
            else
                return part1 < 1 << 21 ? 7 : 8;
        }
    } else
        return part2 < 1 << 7 ? 9 : 10;
};

/**
 * Zigzag encodes a signed 64bit integer so that it can be effectively used with varint encoding.
 * @param {number|!Long} value Signed long
 * @returns {!Long} Unsigned zigzag encoded long
 * @expose
 */
export function zigZagEncode64(value: number) {
    if (typeof value === 'number')
        value = Long.fromNumber(value, false);
    else if (typeof value === 'string')
        value = Long.fromString(value, false);
    else if (value.unsigned !== false) value = value.toSigned();
    // ref: src/google/protobuf/wire_format_lite.h
    return value.shiftLeft(1).xor(value.shiftRight(63)).toUnsigned();
};

/**
 * Decodes a zigzag encoded signed 64bit integer.
 * @param {!Long|number} value Unsigned zigzag encoded long or JavaScript number
 * @returns {!Long} Signed long
 * @expose
 */
export function zigZagDecode64(value: number) {
    if (typeof value === 'number')
        value = Long.fromNumber(value, false);
    else if (typeof value === 'string')
        value = Long.fromString(value, false);
    else if (value.unsigned !== false) value = value.toSigned();
    // ref: src/google/protobuf/wire_format_lite.h
    return value.shiftRightUnsigned(1).xor(value.and(Long.ONE).toSigned().negate()).toSigned();
};

/**
 * Writes a 64bit base 128 variable-length integer.
 * @param {number|Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} `this` if offset is omitted, else the actual number of bytes written.
 * @expose
 */
export function writeVarint64(buf: ByteBuffer, value: number, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (relative) offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value === 'number')
            value = Long.fromNumber(value);
        else if (typeof value === 'string')
            value = Long.fromString(value);
        else if (!(value && value instanceof Long))
            throw TypeError("Illegal value: " + value + " (not an integer or Long)");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    if (typeof value === 'number')
        value = Long.fromNumber(value, false);
    else if (typeof value === 'string')
        value = Long.fromString(value, false);
    else if (value.unsigned !== false) value = value.toSigned();
    var size = ByteBuffer.calculateVarint64(value),
        part0 = value.toInt() >>> 0,
        part1 = value.shiftRightUnsigned(28).toInt() >>> 0,
        part2 = value.shiftRightUnsigned(56).toInt() >>> 0;
    offset += size;
    var capacity11 = buf.buffer.length;
    if (offset > capacity11)
        resize(buf, (capacity11 *= 2) > offset ? capacity11 : offset);
    offset -= size;
    switch (size) {
        case 10: buf.buffer[offset + 9] = (part2 >>> 7) & 0x01;
        case 9: buf.buffer[offset + 8] = size !== 9 ? (part2) | 0x80 : (part2) & 0x7F;
        case 8: buf.buffer[offset + 7] = size !== 8 ? (part1 >>> 21) | 0x80 : (part1 >>> 21) & 0x7F;
        case 7: buf.buffer[offset + 6] = size !== 7 ? (part1 >>> 14) | 0x80 : (part1 >>> 14) & 0x7F;
        case 6: buf.buffer[offset + 5] = size !== 6 ? (part1 >>> 7) | 0x80 : (part1 >>> 7) & 0x7F;
        case 5: buf.buffer[offset + 4] = size !== 5 ? (part1) | 0x80 : (part1) & 0x7F;
        case 4: buf.buffer[offset + 3] = size !== 4 ? (part0 >>> 21) | 0x80 : (part0 >>> 21) & 0x7F;
        case 3: buf.buffer[offset + 2] = size !== 3 ? (part0 >>> 14) | 0x80 : (part0 >>> 14) & 0x7F;
        case 2: buf.buffer[offset + 1] = size !== 2 ? (part0 >>> 7) | 0x80 : (part0 >>> 7) & 0x7F;
        case 1: buf.buffer[offset] = size !== 1 ? (part0) | 0x80 : (part0) & 0x7F;
    }
    if (relative) {
        buf.offset += size;
        return this;
    } else {
        return size;
    }
};

/**
 * Writes a zig-zag encoded 64bit base 128 variable-length integer.
 * @param {number|Long} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} `this` if offset is omitted, else the actual number of bytes written.
 * @expose
 */
export function writeVarint64ZigZag(buf: ByteBuffer, value: number, offset?: number) {
    return writeVarint64(buf, zigZagEncode64(value), offset);
};

/**
 * Reads a 64bit base 128 variable-length integer. Requires Long.js.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {!Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and
 *  the actual number of bytes read.
 * @throws {Error} If it's not a valid varint
 * @expose
 */
export function readVarint64(buf: ByteBuffer, offset?: number) {
    var relative = typeof offset === 'undefined';
    if (relative) offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    // ref: src/google/protobuf/io/coded_stream.cc
    var start = offset,
        part0 = 0,
        part1 = 0,
        part2 = 0,
        b = 0;
    b = buf.buffer[offset++]; part0 = (b & 0x7F); if (b & 0x80) {
        b = buf.buffer[offset++]; part0 |= (b & 0x7F) << 7; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
            b = buf.buffer[offset++]; part0 |= (b & 0x7F) << 14; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                b = buf.buffer[offset++]; part0 |= (b & 0x7F) << 21; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                    b = buf.buffer[offset++]; part1 = (b & 0x7F); if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                        b = buf.buffer[offset++]; part1 |= (b & 0x7F) << 7; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                            b = buf.buffer[offset++]; part1 |= (b & 0x7F) << 14; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                                b = buf.buffer[offset++]; part1 |= (b & 0x7F) << 21; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                                    b = buf.buffer[offset++]; part2 = (b & 0x7F); if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                                        b = buf.buffer[offset++]; part2 |= (b & 0x7F) << 7; if ((b & 0x80) || (buf.noAssert && typeof b === 'undefined')) {
                                            throw Error("Buffer overrun");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    var value = Long.fromBits(part0 | (part1 << 28), (part1 >>> 4) | (part2) << 24, false);
    if (relative) {
        buf.offset = offset;
        return value;
    } else {
        return {
            'value': value,
            'length': offset - start
        };
    }
};

/**
 * Reads a zig-zag encoded 64bit base 128 variable-length integer. Requires Long.js.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {!Long|!{value: Long, length: number}} The value read if offset is omitted, else the value read and
 *  the actual number of bytes read.
 * @throws {Error} If it's not a valid varint
 * @expose
 */
export function readVarint64ZigZag(buf: ByteBuffer, offset?: number) {
    var val = readVarint64(buf, offset);
    if (val && val['value'] instanceof Long)
        val["value"] = zigZagDecode64(val["value"]);
    else
        val = zigZagDecode64(val);
    return val;
};

