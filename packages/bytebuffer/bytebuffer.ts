import { Buffer } from "buffer";
/*
 Copyright 2013-2014 Daniel Wirtz <dcode@dcode.io>

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license bytebuffer.js (c) 2015 Daniel Wirtz <dcode@dcode.io>
 * Backing buffer / Accessor: node Buffer
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/bytebuffer.js for details
 */

/**
 * Constructs a new ByteBuffer.
 * @class The swiss army knife for binary data in JavaScript.
 * @exports ByteBuffer
 * @constructor
 * @param {number=} capacity Initial capacity. Defaults to {@link DEFAULT_CAPACITY}.
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @expose
 */
export class ByteBuffer {
    /**
    * Backing node Buffer.
    * @type {!Buffer}
    * @expose
    */
    public buffer: Buffer = this.capacity === 0 ? EMPTY_BUFFER : new Buffer(this.capacity);

    public view: DataView = new DataView(this.buffer);

    /**
     * Absolute read/write offset.
     * @type {number}
     * @expose
     * @see ByteBuffer#flip
     * @see ByteBuffer#clear
     */
    public offset = 0;

    /**
     * Marked offset.
     * @type {number}
     * @expose
     * @see ByteBuffer#mark
     * @see ByteBuffer#reset
     */
    public markedOffset = -1;

    /**
     * Absolute limit of the contained data. Set to the backing buffer's capacity upon allocation.
     * @type {number}
     * @expose
     * @see ByteBuffer#flip
     * @see ByteBuffer#clear
     */
    public limit = this.capacity;

    constructor(
        public capacity: number = DEFAULT_CAPACITY,
        /**
         * Whether to use little endian byte order, defaults to `false` for big endian.
         * @type {boolean}
         * @expose
         */
        public littleEndian: boolean = DEFAULT_ENDIAN,
        /**
         * Whether to skip assertions of offsets and values, defaults to `false`.
         * @type {boolean}
         * @expose
         */
        public noAssert: boolean = DEFAULT_NOASSERT) {
        this.capacity = capacity | 0;
        if (capacity < 0)
            throw RangeError("Illegal capacity");
        this.littleEndian = !!littleEndian;
        this.noAssert = !!noAssert;
    }

    use<T extends { [key: string]: (b: ByteBuffer, ...args: any[]) => any }>(funcs: T)
        : this & ByteBufferWithAddons<this, T> {
        for (let key in funcs) {
            (this as any)[key] = (...args: any[]) => funcs[key](this, args);
        }
        Object.assign(this.used, funcs);
        return this as any;
    }

    readonly used: { [key: string]: (b: ByteBuffer, ...args: any[]) => any } = {}
}

type ByteBufferWithAddons<Self extends ByteBuffer, Addon extends { [key: string]: (b: ByteBuffer, ...args: any[]) => any }> = {
    [P in keyof Addon]: ByteBufFunc<Self, Addon, Addon[P]>
};

type ByteBufFunc<Self extends ByteBuffer, Addon extends { [key: string]: (b: ByteBuffer, ...args: any[]) => any }, Func extends (b: Self, ...args: any[]) => any> =
    Func extends (b: Self, ...args: infer P) => infer R
    ? R extends Self ? (this: Self, ...args: P) => Self & ByteBufferWithAddons<Self, Addon> : (this: Self, ...args: P) => R
    : never;

/**
 * ByteBuffer version.
 * @type {string}
 * @const
 * @expose
 */
export const VERSION = "5.0.1";

/**
 * Little endian constant that can be used instead of its boolean value. Evaluates to `true`.
 * @type {boolean}
 * @const
 * @expose
 */
export const LITTLE_ENDIAN = true;

/**
 * Big endian constant that can be used instead of its boolean value. Evaluates to `false`.
 * @type {boolean}
 * @const
 * @expose
 */
export const BIG_ENDIAN = false;

/**
 * Default initial capacity of `16`.
 * @type {number}
 * @expose
 */
export const DEFAULT_CAPACITY = 16;

/**
 * Default endianess of `false` for big endian.
 * @type {boolean}
 * @expose
 */
export const DEFAULT_ENDIAN = BIG_ENDIAN;

/**
 * Default no assertions flag of `false`.
 * @type {boolean}
 * @expose
 */
export const DEFAULT_NOASSERT = false;

// helpers

/**
 * @type {!Buffer}
 * @inner
 */
export const EMPTY_BUFFER = new Buffer(0);

/**
 * Allocates a new ByteBuffer backed by a buffer of the specified capacity.
 * @param {number=} capacity Initial capacity. Defaults to {@link DEFAULT_CAPACITY}.
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer}
 * @expose
 */
export function allocate(capacity?: number, littleEndian?: boolean, noAssert?: boolean) {
    return new ByteBuffer(capacity, littleEndian, noAssert);
};

/**
 * Concatenates multiple ByteBuffers into one.
 * @param {!Array.<!ByteBuffer|!Buffer|!ArrayBuffer|!Uint8Array|string>} buffers Buffers to concatenate
 * @param {(string|boolean)=} encoding String encoding if `buffers` contains a string ("base64", "hex", "binary",
 *  defaults to "utf8")
 * @param {boolean=} littleEndian Whether to use little or big endian byte order for the resulting ByteBuffer. Defaults
 *  to {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values for the resulting ByteBuffer. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer} Concatenated ByteBuffer
 * @expose
 */
export function concat(buffers: Array<ByteBuffer> | Array<Buffer> | Array<ArrayBuffer> | Array<Uint8Array> | string[],
    encoding?: string | boolean, littleEndian?: boolean, noAssert?: boolean) {
    if (typeof encoding === 'boolean' || typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    let capacity = 0;
    let bbuffers: ByteBuffer[] = new Array(buffers.length);
    for (var i = 0, k = buffers.length, length; i < k; ++i) {
        if (!isByteBuffer(buffers[i]))
            bbuffers[i] = wrap(buffers[i], encoding);
        let e = bbuffers[i];
        length = e.limit - e.offset;
        if (length > 0) capacity += length;
    }
    if (capacity === 0)
        return new ByteBuffer(0, littleEndian, noAssert);

    let bb = new ByteBuffer(capacity, littleEndian, noAssert),
        bi;
    i = 0;
    while (i < k) {
        bi = bbuffers[i++];
        length = bi.limit - bi.offset;
        if (length <= 0) continue;
        bi.buffer.copy(bb.buffer, bb.offset, bi.offset, bi.limit);
        bb.offset += length;
    }
    bb.limit = bb.offset;
    bb.offset = 0;
    return bb;
};

/**
 * Tests if the specified type is a ByteBuffer.
 * @param {*} bb ByteBuffer to test
 * @returns {boolean} `true` if it is a ByteBuffer, otherwise `false`
 * @expose
 */
export function isByteBuffer(bb: any): bb is ByteBuffer {
    return (bb && bb instanceof ByteBuffer) === true;
};
/**
 * Wraps a buffer or a string. Sets the allocated ByteBuffer's {@link ByteBuffer#offset} to `0` and its
 *  {@link ByteBuffer#limit} to the length of the wrapped data.
 * @param {!ByteBuffer|!Buffer|!ArrayBuffer|!Uint8Array|string|!Array.<number>} buffer Anything that can be wrapped
 * @param {(string|boolean)=} encoding String encoding if `buffer` is a string ("base64", "hex", "binary", defaults to
 *  "utf8")
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer} A ByteBuffer wrapping `buffer`
 * @expose
 */
export function wrap(buffer: ByteBuffer | Buffer | ArrayBuffer | Uint8Array | string | Array<number>,
    encoding?: string | boolean, littleEndian?: boolean, noAssert?: boolean): ByteBuffer {
    if (typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    if (typeof buffer === 'string') {
        if (typeof encoding === 'undefined')
            encoding = "utf8";
        switch (encoding) {
            case "base64":
                return fromBase64(buffer, littleEndian);
            case "hex":
                return fromHex(buffer, littleEndian, noAssert);
            case "binary":
                return fromBinary(buffer, littleEndian);
            case "utf8":
                return fromUTF8(buffer, littleEndian, noAssert);
            case "debug":
                return fromDebug(buffer, littleEndian, noAssert);
            default:
                throw Error("Unsupported encoding: " + encoding);
        }
    }
    if (buffer === null || typeof buffer !== 'object')
        throw TypeError("Illegal buffer");
    let bb;
    if (isByteBuffer(buffer)) {
        bb = clone(buffer);
        bb.markedOffset = -1;
        return bb;
    }
    let bbuffer = Buffer.from(buffer);
    bb = new ByteBuffer(0, littleEndian, noAssert);
    if (bbuffer.length > 0) { // Avoid references to more than one EMPTY_BUFFER
        bb.buffer = bbuffer;
        bb.limit = bbuffer.length;
    }
    return bb;
};

/**
 * Writes the array as a bitset.
 * @param {Array<boolean>} value Array of booleans to write
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `length` if omitted.
 * @returns {!ByteBuffer}
 * @expose
 */
export function writeBitSet(buf: ByteBuffer, value: boolean[], offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (!(value instanceof Array))
            throw TypeError("Illegal BitSet: Not an array");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }

    let start = offset,
        bits = value.length,
        bytes = (bits >> 3),
        bit = 0,
        k;

    offset += writeVarint32(buf, bits, offset);

    while (bytes--) {
        k = (!!value[bit++] as any & 1) |
            ((!!value[bit++] as any & 1) << 1) |
            ((!!value[bit++] as any & 1) << 2) |
            ((!!value[bit++] as any & 1) << 3) |
            ((!!value[bit++] as any & 1) << 4) |
            ((!!value[bit++] as any & 1) << 5) |
            ((!!value[bit++] as any & 1) << 6) |
            ((!!value[bit++] as any & 1) << 7);
        writeByte(buf, k, offset++);
    }

    if (bit < bits) {
        let m = 0; k = 0;
        while (bit < bits) k = k | ((!!value[bit++] as any & 1) << (m++));
        writeByte(buf, k, offset++);
    }

    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return offset - start;
}

/**
 * Reads a BitSet as an array of booleans.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `length` if omitted.
 * @returns {Array<boolean>
 * @expose
 */
export function readBitSet(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;

    let ret = readVarint32(buf, offset),
        bits = ret.value,
        bytes = (bits >> 3),
        bit = 0,
        value = [],
        k;

    offset += ret.length;

    while (bytes--) {
        k = readByte(buf, offset++);
        value[bit++] = !!(k & 0x01);
        value[bit++] = !!(k & 0x02);
        value[bit++] = !!(k & 0x04);
        value[bit++] = !!(k & 0x08);
        value[bit++] = !!(k & 0x10);
        value[bit++] = !!(k & 0x20);
        value[bit++] = !!(k & 0x40);
        value[bit++] = !!(k & 0x80);
    }

    if (bit < bits) {
        let m = 0;
        k = readByte(buf, offset++);
        while (bit < bits) value[bit++] = !!((k >> (m++)) & 1);
    }

    if (relative) {
        buf.offset = offset;
    }
    return value;
}
/**
 * Reads the specified number of bytes.
 * @param {number} length Number of bytes to read
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `length` if omitted.
 * @returns {!ByteBuffer}
 * @expose
 */
export function readBytes(buf: ByteBuffer, length: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + length > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + length + ") <= " + buf.buffer.length);
    }
    let sliced = slice(buf, offset, offset + length);
    if (relative) buf.offset += length;
    return sliced;
};


// types/ints/int8

/**
 * Writes an 8bit signed integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeInt8<T extends ByteBuffer>(buf: T, value: number, offset?: number): T {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value |= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 1;
    let capacity0 = buf.buffer.length;
    if (offset > capacity0)
        resize(buf, (capacity0 *= 2) > offset ? capacity0 : offset);
    offset -= 1;
    buf.buffer[offset] = value;
    if (relative) buf.offset += 1;
    return buf;
};

/**
 * Writes an 8bit signed integer. This is an alias of {@link ByteBuffer#writeInt8}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeByte = writeInt8;

/**
 * Reads an 8bit signed integer.
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {number} Value read
 * @expose
 */
export function readInt8(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    let value = buf.buffer[offset];
    if ((value & 0x80) === 0x80) value = -(0xFF - value + 1); // Cast to signed
    if (relative) buf.offset += 1;
    return value;
};

/**
 * Reads an 8bit signed integer. This is an alias of {@link ByteBuffer#readInt8}.
 * @function
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {number} Value read
 * @expose
 */
export const readByte = readInt8;

/**
 * Writes an 8bit unsigned integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeUint8<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value >>>= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 1;
    let capacity1 = buf.buffer.length;
    if (offset > capacity1)
        resize(buf, (capacity1 *= 2) > offset ? capacity1 : offset);
    offset -= 1;
    buf.buffer[offset] = value;
    if (relative) buf.offset += 1;
    return buf;
};

/**
 * Writes an 8bit unsigned integer. This is an alias of {@link ByteBuffer#writeUint8}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeUInt8 = writeUint8;

/**
 * Reads an 8bit unsigned integer.
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {number} Value read
 * @expose
 */
export function readUint8(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    let value = buf.buffer[offset];
    if (relative) buf.offset += 1;
    return value;
};

/**
 * Reads an 8bit unsigned integer. This is an alias of {@link ByteBuffer#readUint8}.
 * @function
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `1` if omitted.
 * @returns {number} Value read
 * @expose
 */
export const readUInt8 = readUint8;

// types/ints/int16

/**
 * Writes a 16bit signed integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @throws {TypeError} If `offset` or `value` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export function writeInt16<T extends ByteBuffer>(buf: T, value: number, offset?: number): T {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value |= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 2;
    let capacity2 = buf.buffer.length;
    if (offset > capacity2)
        resize(buf, (capacity2 *= 2) > offset ? capacity2 : offset);
    offset -= 2;
    if (buf.littleEndian) {
        buf.buffer[offset + 1] = (value & 0xFF00) >>> 8;
        buf.buffer[offset] = value & 0x00FF;
    } else {
        buf.buffer[offset] = (value & 0xFF00) >>> 8;
        buf.buffer[offset + 1] = value & 0x00FF;
    }
    if (relative) buf.offset += 2;
    return buf;
};

/**
 * Writes a 16bit signed integer. This is an alias of {@link ByteBuffer#writeInt16}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @throws {TypeError} If `offset` or `value` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export const writeShort = writeInt16;

/**
 * Reads a 16bit signed integer.
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @returns {number} Value read
 * @throws {TypeError} If `offset` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export function readInt16(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 2 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 2 + ") <= " + buf.buffer.length);
    }
    let value = 0;
    if (buf.littleEndian) {
        value = buf.buffer[offset];
        value |= buf.buffer[offset + 1] << 8;
    } else {
        value = buf.buffer[offset] << 8;
        value |= buf.buffer[offset + 1];
    }
    if ((value & 0x8000) === 0x8000) value = -(0xFFFF - value + 1); // Cast to signed
    if (relative) buf.offset += 2;
    return value;
};

/**
 * Reads a 16bit signed integer. This is an alias of {@link ByteBuffer#readInt16}.
 * @function
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @returns {number} Value read
 * @throws {TypeError} If `offset` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export const readShort = readInt16;

/**
 * Writes a 16bit unsigned integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @throws {TypeError} If `offset` or `value` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export function writeUint16<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value >>>= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 2;
    let capacity3 = buf.buffer.length;
    if (offset > capacity3)
        resize(buf, (capacity3 *= 2) > offset ? capacity3 : offset);
    offset -= 2;
    if (buf.littleEndian) {
        buf.buffer[offset + 1] = (value & 0xFF00) >>> 8;
        buf.buffer[offset] = value & 0x00FF;
    } else {
        buf.buffer[offset] = (value & 0xFF00) >>> 8;
        buf.buffer[offset + 1] = value & 0x00FF;
    }
    if (relative) buf.offset += 2;
    return buf;
};

/**
 * Writes a 16bit unsigned integer. This is an alias of {@link ByteBuffer#writeUint16}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @throws {TypeError} If `offset` or `value` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export const writeUInt16 = writeUint16;

/**
 * Reads a 16bit unsigned integer.
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @returns {number} Value read
 * @throws {TypeError} If `offset` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export function readUint16(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 2 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 2 + ") <= " + buf.buffer.length);
    }
    let value = 0;
    if (buf.littleEndian) {
        value = buf.buffer[offset];
        value |= buf.buffer[offset + 1] << 8;
    } else {
        value = buf.buffer[offset] << 8;
        value |= buf.buffer[offset + 1];
    }
    if (relative) buf.offset += 2;
    return value;
};

/**
 * Reads a 16bit unsigned integer. This is an alias of {@link ByteBuffer#readUint16}.
 * @function
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `2` if omitted.
 * @returns {number} Value read
 * @throws {TypeError} If `offset` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @expose
 */
export const readUInt16 = readUint16;

// types/ints/int32

/**
 * Writes a 32bit signed integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @expose
 */
export function writeInt32<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value |= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 4;
    let capacity4 = buf.buffer.length;
    if (offset > capacity4)
        resize(buf, (capacity4 *= 2) > offset ? capacity4 : offset);
    offset -= 4;
    if (buf.littleEndian) {
        buf.buffer[offset + 3] = (value >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (value >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (value >>> 8) & 0xFF;
        buf.buffer[offset] = value & 0xFF;
    } else {
        buf.buffer[offset] = (value >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (value >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (value >>> 8) & 0xFF;
        buf.buffer[offset + 3] = value & 0xFF;
    }
    if (relative) buf.offset += 4;
    return buf;
};

/**
 * Writes a 32bit signed integer. This is an alias of {@link ByteBuffer#writeInt32}.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @expose
 */
export const writeInt = writeInt32;

/**
 * Reads a 32bit signed integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number} Value read
 * @expose
 */
export function readInt32(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 4 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + buf.buffer.length);
    }
    let value = 0;
    if (buf.littleEndian) {
        value = buf.buffer[offset + 2] << 16;
        value |= buf.buffer[offset + 1] << 8;
        value |= buf.buffer[offset];
        value += buf.buffer[offset + 3] << 24 >>> 0;
    } else {
        value = buf.buffer[offset + 1] << 16;
        value |= buf.buffer[offset + 2] << 8;
        value |= buf.buffer[offset + 3];
        value += buf.buffer[offset] << 24 >>> 0;
    }
    value |= 0; // Cast to signed
    if (relative) buf.offset += 4;
    return value;
};

/**
 * Reads a 32bit signed integer. This is an alias of {@link ByteBuffer#readInt32}.
 * @param {number=} offset Offset to read from. Will use and advance {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number} Value read
 * @expose
 */
export const readInt = readInt32;

/**
 * Writes a 32bit unsigned integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @expose
 */
export function writeUint32<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value >>>= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 4;
    let capacity5 = buf.buffer.length;
    if (offset > capacity5)
        resize(buf, (capacity5 *= 2) > offset ? capacity5 : offset);
    offset -= 4;
    if (buf.littleEndian) {
        buf.buffer[offset + 3] = (value >>> 24) & 0xFF;
        buf.buffer[offset + 2] = (value >>> 16) & 0xFF;
        buf.buffer[offset + 1] = (value >>> 8) & 0xFF;
        buf.buffer[offset] = value & 0xFF;
    } else {
        buf.buffer[offset] = (value >>> 24) & 0xFF;
        buf.buffer[offset + 1] = (value >>> 16) & 0xFF;
        buf.buffer[offset + 2] = (value >>> 8) & 0xFF;
        buf.buffer[offset + 3] = value & 0xFF;
    }
    if (relative) buf.offset += 4;
    return buf;
};

/**
 * Writes a 32bit unsigned integer. This is an alias of {@link ByteBuffer#writeUint32}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @expose
 */
export const writeUInt32 = writeUint32;

/**
 * Reads a 32bit unsigned integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number} Value read
 * @expose
 */
export function readUint32(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 4 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + buf.buffer.length);
    }
    let value = 0;
    if (buf.littleEndian) {
        value = buf.buffer[offset + 2] << 16;
        value |= buf.buffer[offset + 1] << 8;
        value |= buf.buffer[offset];
        value += buf.buffer[offset + 3] << 24 >>> 0;
    } else {
        value = buf.buffer[offset + 1] << 16;
        value |= buf.buffer[offset + 2] << 8;
        value |= buf.buffer[offset + 3];
        value += buf.buffer[offset] << 24 >>> 0;
    }
    if (relative) buf.offset += 4;
    return value;
};

/**
 * Reads a 32bit unsigned integer. This is an alias of {@link ByteBuffer#readUint32}.
 * @function
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number} Value read
 * @expose
 */
export const readUInt32 = readUint32;

// types/floats/float32

/**
 * Writes a 32bit float.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeFloat32<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number')
            throw TypeError("Illegal value: " + value + " (not a number)");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 4;
    let capacity8 = buf.buffer.length;
    if (offset > capacity8)
        resize(buf, (capacity8 *= 2) > offset ? capacity8 : offset);
    offset -= 4;
    buf.littleEndian
        ? buf.buffer.writeFloatLE(value, offset)
        : buf.buffer.writeFloatBE(value, offset);
    if (relative) buf.offset += 4;
    return buf;
};

/**
 * Writes a 32bit float. This is an alias of {@link ByteBuffer#writeFloat32}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeFloat = writeFloat32;

/**
 * Reads a 32bit float.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number}
 * @expose
 */
export function readFloat32(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 4 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 4 + ") <= " + buf.buffer.length);
    }
    let value = buf.littleEndian
        ? buf.buffer.readFloatLE(offset)
        : buf.buffer.readFloatBE(offset);
    if (relative) buf.offset += 4;
    return value;
};

/**
 * Reads a 32bit float. This is an alias of {@link ByteBuffer#readFloat32}.
 * @function
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `4` if omitted.
 * @returns {number}
 * @expose
 */
export const readFloat = readFloat32;

// types/floats/float64

/**
 * Writes a 64bit float.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function writeFloat64<T extends ByteBuffer>(buf: T, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number')
            throw TypeError("Illegal value: " + value + " (not a number)");
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    offset += 8;
    let capacity9 = buf.buffer.length;
    if (offset > capacity9)
        resize(buf, (capacity9 *= 2) > offset ? capacity9 : offset);
    offset -= 8;
    buf.littleEndian
        ? buf.buffer.writeDoubleLE(value, offset)
        : buf.buffer.writeDoubleBE(value, offset);
    if (relative) buf.offset += 8;
    return buf;
};

/**
 * Writes a 64bit float. This is an alias of {@link ByteBuffer#writeFloat64}.
 * @function
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeDouble = writeFloat64;

/**
 * Reads a 64bit float.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {number}
 * @expose
 */
export function readFloat64(buf: ByteBuffer, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 8 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 8 + ") <= " + buf.buffer.length);
    }
    var value = buf.littleEndian
        ? buf.buffer.readDoubleLE(offset)
        : buf.buffer.readDoubleBE(offset);
    if (relative) buf.offset += 8;
    return value;
};

/**
 * Reads a 64bit float. This is an alias of {@link ByteBuffer#readFloat64}.
 * @function
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by `8` if omitted.
 * @returns {number}
 * @expose
 */
export const readDouble = readFloat64;


// types/varints/varint32

/**
 * Maximum number of bytes required to store a 32bit base 128 variable-length integer.
 * @type {number}
 * @const
 * @expose
 */
export const MAX_VARINT32_BYTES = 5;

/**
 * Calculates the actual number of bytes required to store a 32bit base 128 variable-length integer.
 * @param {number} value Value to encode
 * @returns {number} Number of bytes required. Capped to {@link MAX_VARINT32_BYTES}
 * @expose
 */
export function calculateVarint32(value: number) {
    // ref: src/google/protobuf/io/coded_stream.cc
    value = value >>> 0;
    if (value < 1 << 7) return 1;
    else if (value < 1 << 14) return 2;
    else if (value < 1 << 21) return 3;
    else if (value < 1 << 28) return 4;
    else return 5;
};

/**
 * Zigzag encodes a signed 32bit integer so that it can be effectively used with varint encoding.
 * @param {number} n Signed 32bit integer
 * @returns {number} Unsigned zigzag encoded 32bit integer
 * @expose
 */
export function zigZagEncode32(n: number) {
    return (((n |= 0) << 1) ^ (n >> 31)) >>> 0; // ref: src/google/protobuf/wire_format_lite.h
};

/**
 * Decodes a zigzag encoded signed 32bit integer.
 * @param {number} n Unsigned zigzag encoded 32bit integer
 * @returns {number} Signed 32bit integer
 * @expose
 */
export function zigZagDecode32(n: number) {
    return ((n >>> 1) ^ -(n & 1)) | 0; // // ref: src/google/protobuf/wire_format_lite.h
};

/**
 * Writes a 32bit base 128 variable-length integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} this if `offset` is omitted, else the actual number of bytes written
 * @expose
 */
export function writeVarint32(buf: ByteBuffer, value: number, offset: number): number;
export function writeVarint32(buf: ByteBuffer, value: number, offset: number | undefined): number | ByteBuffer;
export function writeVarint32(buf: ByteBuffer, value: number, offset?: number) {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value |= 0;
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    let size = calculateVarint32(value),
        b;
    offset += size;
    let capacity10 = buf.buffer.length;
    if (offset > capacity10)
        resize(buf, (capacity10 *= 2) > offset ? capacity10 : offset);
    offset -= size;
    value >>>= 0;
    while (value >= 0x80) {
        b = (value & 0x7f) | 0x80;
        buf.buffer[offset++] = b;
        value >>>= 7;
    }
    buf.buffer[offset++] = value;
    if (relative) {
        buf.offset = offset;
        return buf;
    }
    return size;
};

/**
 * Writes a zig-zag encoded (signed) 32bit base 128 variable-length integer.
 * @param {number} value Value to write
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer|number} this if `offset` is omitted, else the actual number of bytes written
 * @expose
 */
export function writeVarint32ZigZag(buf: ByteBuffer, value: number, offset?: number) {
    return writeVarint32(buf, zigZagEncode32(value), offset);
};

export function readVarint32(buf: ByteBuffer, offset: number): { value: number; length: number };
// export function readVarint32(buf: ByteBuffer, offset: undefined): { value: number; length: number };
export function readVarint32(buf: ByteBuffer, offset: undefined | number): number | { value: number; length: number };
/**
 * Reads a 32bit base 128 variable-length integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
 *  and the actual number of bytes read.
 * @throws {Error} If it's not a valid varint. Has a property `truncated = true` if there is not enough data available
 *  to fully decode the varint.
 * @expose
 */
export function readVarint32(buf: ByteBuffer, offset?: number): number | { value: number, length: number } {
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 1 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 1 + ") <= " + buf.buffer.length);
    }
    let c = 0,
        value = 0 >>> 0,
        b;
    do {
        if (!buf.noAssert && offset > buf.limit) {
            let err = new Error("Truncated");
            (err as any)['truncated'] = true;
            throw err;
        }
        b = buf.buffer[offset++];
        if (c < 5)
            value |= (b & 0x7f) << (7 * c);
        ++c;
    } while ((b & 0x80) !== 0);
    value |= 0;
    if (relative) {
        buf.offset = offset;
        return value;
    }
    return {
        "value": value,
        "length": c
    };
};

/**
 * Reads a zig-zag encoded (signed) 32bit base 128 variable-length integer.
 * @param {number=} offset Offset to read from. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {number|!{value: number, length: number}} The value read if offset is omitted, else the value read
 *  and the actual number of bytes read.
 * @throws {Error} If it's not a valid varint
 * @expose
 */
export function readVarint32ZigZag(buf: ByteBuffer, offset?: number) {
    let val = readVarint32(buf, offset);
    if (typeof val === 'object')
        val["value"] = zigZagDecode32(val["value"]);
    else
        val = zigZagDecode32(val);
    return val;
};

/**
 * Appends some data to this  This will overwrite any contents behind the specified offset up to the appended
 *  data's length.
 * @param {!ByteBuffer|!Buffer|!ArrayBuffer|!Uint8Array|string} source Data to append. If `source` is a ByteBuffer, its
 * offsets will be modified according to the performed read operation.
 * @param {(string|number)=} encoding Encoding if `data` is a string ("base64", "hex", "binary", defaults to "utf8")
 * @param {number=} offset Offset to append at. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 * @example A relative `<01 02>03.append(<04 05>)` will result in `<01 02 04 05>, 04 05|`
 * @example An absolute `<01 02>03.append(04 05>, 1)` will result in `<01 04>05, 04 05|`
 */
export function append(buf: ByteBuffer, source: ByteBuffer | Buffer | ArrayBuffer | Uint8Array | string, encoding?: string | number, offset?: number) {
    if (typeof encoding === 'number' || typeof encoding !== 'string') {
        offset = encoding;
        encoding = undefined;
    }
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    if (!(source instanceof ByteBuffer))
        source = wrap(source, encoding);
    let length = source.limit - source.offset;
    if (length <= 0) return buf; // Nothing to append
    offset += length;
    let capacity16 = buf.buffer.length;
    if (offset > capacity16)
        resize(buf, (capacity16 *= 2) > offset ? capacity16 : offset);
    offset -= length;
    source.buffer.copy(buf.buffer, offset, source.offset, source.limit);
    source.offset += length;
    if (relative) buf.offset += length;
    return buf;
};

/**
 * Appends this ByteBuffer's contents to another  This will overwrite any contents at and after the
    specified offset up to the length of this ByteBuffer's data.
 * @param {!ByteBuffer} target Target ByteBuffer
 * @param {number=} offset Offset to append to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  read if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 * @see ByteBuffer#append
 */
export function appendTo(buf: ByteBuffer, target: ByteBuffer, offset?: number) {
    append(target, buf, offset);
    return buf;
};

/**
 * Writes a payload of bytes. This is an alias of {@link ByteBuffer#append}.
 * @function
 * @param {!ByteBuffer|!Buffer|!ArrayBuffer|!Uint8Array|string} source Data to write. If `source` is a ByteBuffer, its
 * offsets will be modified according to the performed read operation.
 * @param {(string|number)=} encoding Encoding if `data` is a string ("base64", "hex", "binary", defaults to "utf8")
 * @param {number=} offset Offset to write to. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 */
export const writeBytes = append;
/**
 * Enables or disables assertions of argument types and offsets. Assertions are enabled by default but you can opt to
 *  disable them if your code already makes sure that everything is valid.
 * @param {boolean} assert `true` to enable assertions, otherwise `false`
 * @returns {!ByteBuffer} this
 * @expose
 */
export function assert(buf: ByteBuffer, assert: boolean) {
    buf.noAssert = !assert;
    return buf;
};

/**
 * Gets the capacity of this ByteBuffer's backing buffer.
 * @returns {number} Capacity of the backing buffer
 * @expose
 */
export function capacity(buf: ByteBuffer, ) {
    return buf.buffer.length;
};
/**
 * Clears this ByteBuffer's offsets by setting {@link ByteBuffer#offset} to `0` and {@link ByteBuffer#limit} to the
 *  backing buffer's capacity. Discards {@link ByteBuffer#markedOffset}.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function clear(buf: ByteBuffer, ) {
    buf.offset = 0;
    buf.limit = buf.buffer.length;
    buf.markedOffset = -1;
    return buf;
};

/**
 * Creates a cloned instance of this ByteBuffer, preset with this ByteBuffer's values for {@link ByteBuffer#offset},
 *  {@link ByteBuffer#markedOffset} and {@link ByteBuffer#limit}.
 * @param {boolean=} copy Whether to copy the backing buffer or to return another view on the same, defaults to `false`
 * @returns {!ByteBuffer} Cloned instance
 * @expose
 */
export function clone<T extends ByteBuffer>(buf: T, copy?: boolean): T {
    let bb = new ByteBuffer(0, buf.littleEndian, buf.noAssert);
    if (copy) {
        let buffer = new Buffer(buf.buffer.length);
        buf.buffer.copy(buffer);
        bb.buffer = buffer;
    } else {
        bb.buffer = buf.buffer;
    }
    bb.offset = buf.offset;
    bb.markedOffset = buf.markedOffset;
    bb.limit = buf.limit;

    (bb as any).used = buf.used;
    bb.use(buf.used);
    return bb as any;
};

/**
 * Compacts this ByteBuffer to be backed by a {@link ByteBuffer#buffer} of its contents' length. Contents are the bytes
 *  between {@link ByteBuffer#offset} and {@link ByteBuffer#limit}. Will set `offset = 0` and `limit = capacity` and
 *  adapt {@link ByteBuffer#markedOffset} to the same relative position if set.
 * @param {number=} begin Offset to start at, defaults to {@link ByteBuffer#offset}
 * @param {number=} end Offset to end at, defaults to {@link ByteBuffer#limit}
 * @returns {!ByteBuffer} this
 * @expose
 */
export function compact(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    if (begin === 0 && end === buf.buffer.length)
        return buf; // Already compacted
    let len = end - begin;
    if (len === 0) {
        buf.buffer = EMPTY_BUFFER;
        if (buf.markedOffset >= 0) buf.markedOffset -= begin;
        buf.offset = 0;
        buf.limit = 0;
        return buf;
    }
    let buffer = new Buffer(len);
    buf.buffer.copy(buffer, 0, begin, end);
    buf.buffer = buffer;
    if (buf.markedOffset >= 0) buf.markedOffset -= begin;
    buf.offset = 0;
    buf.limit = len;
    return buf;
};

/**
 * Creates a copy of this ByteBuffer's contents. Contents are the bytes between {@link ByteBuffer#offset} and
 *  {@link ByteBuffer#limit}.
 * @param {number=} begin Begin offset, defaults to {@link ByteBuffer#offset}.
 * @param {number=} end End offset, defaults to {@link ByteBuffer#limit}.
 * @returns {!ByteBuffer} Copy
 * @expose
 */
export function copy(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    if (begin === end)
        return new ByteBuffer(0, buf.littleEndian, buf.noAssert);
    let capacity = end - begin,
        bb = new ByteBuffer(capacity, buf.littleEndian, buf.noAssert);
    bb.offset = 0;
    bb.limit = capacity;
    if (bb.markedOffset >= 0) bb.markedOffset -= begin;
    copyTo(buf, bb, 0, begin, end);
    return bb;
};

/**
 * Copies this ByteBuffer's contents to another  Contents are the bytes between {@link ByteBuffer#offset} and
 *  {@link ByteBuffer#limit}.
 * @param {!ByteBuffer} target Target ByteBuffer
 * @param {number=} targetOffset Offset to copy to. Will use and increase the target's {@link ByteBuffer#offset}
 *  by the number of bytes copied if omitted.
 * @param {number=} sourceOffset Offset to start copying from. Will use and increase {@link ByteBuffer#offset} by the
 *  number of bytes copied if omitted.
 * @param {number=} sourceLimit Offset to end copying from, defaults to {@link ByteBuffer#limit}
 * @returns {!ByteBuffer} this
 * @expose
 */
export function copyTo(buf: ByteBuffer, target: ByteBuffer, targetOffset?: number, sourceOffset?: number, sourceLimit?: number) {
    let relative,
        targetRelative;
    if (!buf.noAssert) {
        if (!isByteBuffer(target))
            throw TypeError("Illegal target: Not a ByteBuffer");
    }
    targetOffset = (targetRelative = typeof targetOffset === 'undefined') ? target.offset : targetOffset | 0;
    sourceOffset = (relative = typeof sourceOffset === 'undefined') ? buf.offset : sourceOffset | 0;
    sourceLimit = typeof sourceLimit === 'undefined' ? buf.limit : sourceLimit | 0;

    if (targetOffset < 0 || targetOffset > target.buffer.length)
        throw RangeError("Illegal target range: 0 <= " + targetOffset + " <= " + target.buffer.length);
    if (sourceOffset < 0 || sourceLimit > buf.buffer.length)
        throw RangeError("Illegal source range: 0 <= " + sourceOffset + " <= " + buf.buffer.length);

    let len = sourceLimit - sourceOffset;
    if (len === 0)
        return target; // Nothing to copy

    ensureCapacity(target, targetOffset + len);

    buf.buffer.copy(target.buffer, targetOffset, sourceOffset, sourceLimit);

    if (relative) buf.offset += len;
    if (targetRelative) target.offset += len;

    return buf;
};

/**
 * Makes sure that this ByteBuffer is backed by a {@link ByteBuffer#buffer} of at least the specified capacity. If the
 *  current capacity is exceeded, it will be doubled. If double the current capacity is less than the required capacity,
 *  the required capacity will be used instead.
 * @param {number} capacity Required capacity
 * @returns {!ByteBuffer} this
 * @expose
 */
export function ensureCapacity(buf: ByteBuffer, capacity: number) {
    let current = buf.buffer.length;
    if (current < capacity)
        return resize(buf, (current *= 2) > capacity ? current : capacity);
    return buf;
};

/**
 * Overwrites this ByteBuffer's contents with the specified value. Contents are the bytes between
 *  {@link ByteBuffer#offset} and {@link ByteBuffer#limit}.
 * @param {number|string} value Byte value to fill with. If given as a string, the first character is used.
 * @param {number=} begin Begin offset. Will use and increase {@link ByteBuffer#offset} by the number of bytes
 *  written if omitted. defaults to {@link ByteBuffer#offset}.
 * @param {number=} end End offset, defaults to {@link ByteBuffer#limit}.
 * @returns {!ByteBuffer} this
 * @expose
 * @example `someByteBuffer.clear().fill(0)` fills the entire backing buffer with zeroes
 */
export function fill(buf: ByteBuffer, value: number | string, begin?: number, end?: number) {
    let relative = typeof begin === 'undefined';
    if (relative) begin = buf.offset;
    if (typeof value === 'string' && value.length > 0)
        value = value.charCodeAt(0);
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof value !== 'number' || value % 1 !== 0)
            throw TypeError("Illegal value: " + value + " (not an integer)");
        value |= 0;
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    if (begin >= end)
        return buf; // Nothing to fill
    buf.buffer.fill(value, begin, end);
    begin = end;
    if (relative) buf.offset = begin;
    return buf;
};

/**
 * Makes this ByteBuffer ready for a new sequence of write or relative read operations. Sets `limit = offset` and
 *  `offset = 0`. Make sure always to flip a ByteBuffer when all relative read or write operations are complete.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function flip(buf: ByteBuffer) {
    buf.limit = buf.offset;
    buf.offset = 0;
    return buf;
};
/**
 * Marks an offset on this ByteBuffer to be used later.
 * @param {number=} offset Offset to mark. Defaults to {@link ByteBuffer#offset}.
 * @returns {!ByteBuffer} this
 * @throws {TypeError} If `offset` is not a valid number
 * @throws {RangeError} If `offset` is out of bounds
 * @see ByteBuffer#reset
 * @expose
 */
export function mark(buf: ByteBuffer, offset?: number) {
    offset = typeof offset === 'undefined' ? buf.offset : offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    buf.markedOffset = offset;
    return buf;
};
/**
 * Sets the byte order.
 * @param {boolean} littleEndian `true` for little endian byte order, `false` for big endian
 * @returns {!ByteBuffer} this
 * @expose
 */
export function order(buf: ByteBuffer, littleEndian: boolean) {
    if (!buf.noAssert) {
        if (typeof littleEndian !== 'boolean')
            throw TypeError("Illegal littleEndian: Not a boolean");
    }
    buf.littleEndian = !!littleEndian;
    return buf;
};

/**
 * Switches (to) little endian byte order.
 * @param {boolean=} littleEndian Defaults to `true`, otherwise uses big endian
 * @returns {!ByteBuffer} this
 * @expose
 */
export function LE(buf: ByteBuffer, littleEndian?: boolean) {
    buf.littleEndian = typeof littleEndian !== 'undefined' ? !!littleEndian : true;
    return buf;
};

/**
 * Switches (to) big endian byte order.
 * @param {boolean=} bigEndian Defaults to `true`, otherwise uses little endian
 * @returns {!ByteBuffer} this
 * @expose
 */
export function BE(buf: ByteBuffer, bigEndian?: boolean) {
    buf.littleEndian = typeof bigEndian !== 'undefined' ? !bigEndian : false;
    return buf;
};
/**
 * Prepends some data to this ByteBuffer. This will overwrite any contents before the specified offset up to the
 *  prepended data's length. If there is not enough space available before the specified `offset`, the backing buffer
 *  will be resized and its contents moved accordingly.
 * @param {!ByteBuffer|string||!Buffer} source Data to prepend. If `source` is a ByteBuffer, its offset will be modified
 *  according to the performed read operation.
 * @param {(string|number)=} encoding Encoding if `data` is a string ("base64", "hex", "binary", defaults to "utf8")
 * @param {number=} offset Offset to prepend at. Will use and decrease {@link ByteBuffer#offset} by the number of bytes
 *  prepended if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 * @example A relative `00<01 02 03>.prepend(<04 05>)` results in `<04 05 01 02 03>, 04 05|`
 * @example An absolute `00<01 02 03>.prepend(<04 05>, 2)` results in `04<05 02 03>, 04 05|`
 */
export function prepend(buf: ByteBuffer, source: ByteBuffer | string | Buffer, encoding?: string | number, offset?: number) {
    if (typeof encoding === 'number' || typeof encoding !== 'string') {
        offset = encoding;
        encoding = undefined;
    }
    let relative = typeof offset === 'undefined';
    if (typeof offset === 'undefined') offset = buf.offset;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: " + offset + " (not an integer)");
        offset >>>= 0;
        if (offset < 0 || offset + 0 > buf.buffer.length)
            throw RangeError("Illegal offset: 0 <= " + offset + " (+" + 0 + ") <= " + buf.buffer.length);
    }
    if (!(source instanceof ByteBuffer))
        source = wrap(source, encoding);
    let len = source.limit - source.offset;
    if (len <= 0) return buf; // Nothing to prepend
    let diff = len - offset;
    if (diff > 0) { // Not enough space before offset, so resize + move
        let buffer = new Buffer(buf.buffer.length + diff);
        buf.buffer.copy(buffer, len, offset, buf.buffer.length);
        buf.buffer = buffer;
        buf.offset += diff;
        if (buf.markedOffset >= 0) buf.markedOffset += diff;
        buf.limit += diff;
        offset += diff;
    } source.buffer.copy(buf.buffer, offset - len, source.offset, source.limit);

    source.offset = source.limit;
    if (relative)
        buf.offset -= len;
    return buf;
};

/**
 * Prepends this ByteBuffer to another ByteBuffer. This will overwrite any contents before the specified offset up to the
 *  prepended data's length. If there is not enough space available before the specified `offset`, the backing buffer
 *  will be resized and its contents moved accordingly.
 * @param {!ByteBuffer} target Target ByteBuffer
 * @param {number=} offset Offset to prepend at. Will use and decrease {@link ByteBuffer#offset} by the number of bytes
 *  prepended if omitted.
 * @returns {!ByteBuffer} this
 * @expose
 * @see ByteBuffer#prepend
 */
export function prependTo(buf: ByteBuffer, target: ByteBuffer, offset?: number) {
    prepend(buf, target, undefined, offset);
    return buf;
};
/**
 * Prints debug information about this ByteBuffer's contents.
 * @param {function(string)=} out Output function to call, defaults to console.log
 * @expose
 */
export function printDebug(buf: ByteBuffer, out?: (s: string) => void) {
    if (typeof out !== 'function') out = console.log.bind(console);
    out(
        toString(buf) + "\n" +
        "-------------------------------------------------------------------\n" +
        toDebug(buf, /* columns */ true)
    );
};

/**
 * Gets the number of remaining readable bytes. Contents are the bytes between {@link ByteBuffer#offset} and
 *  {@link ByteBuffer#limit}, so this returns `limit - offset`.
 * @returns {number} Remaining readable bytes. May be negative if `offset > limit`.
 * @expose
 */
export function remaining(buf: ByteBuffer) {
    return buf.limit - buf.offset;
};
/**
 * Resets this ByteBuffer's {@link ByteBuffer#offset}. If an offset has been marked through {@link ByteBuffer#mark}
 *  before, `offset` will be set to {@link ByteBuffer#markedOffset}, which will then be discarded. If no offset has been
 *  marked, sets `offset = 0`.
 * @returns {!ByteBuffer} this
 * @see ByteBuffer#mark
 * @expose
 */
export function reset(buf: ByteBuffer) {
    if (buf.markedOffset >= 0) {
        buf.offset = buf.markedOffset;
        buf.markedOffset = -1;
    } else {
        buf.offset = 0;
    }
    return buf;
};
/**
 * Resizes this ByteBuffer to be backed by a buffer of at least the given capacity. Will do nothing if already that
 *  large or larger.
 * @param {number} capacity Capacity required
 * @returns {!ByteBuffer} this
 * @throws {TypeError} If `capacity` is not a number
 * @throws {RangeError} If `capacity < 0`
 * @expose
 */
export function resize(buf: ByteBuffer, capacity: number) {
    if (!buf.noAssert) {
        if (typeof capacity !== 'number' || capacity % 1 !== 0)
            throw TypeError("Illegal capacity: " + capacity + " (not an integer)");
        capacity |= 0;
        if (capacity < 0)
            throw RangeError("Illegal capacity: 0 <= " + capacity);
    }
    if (buf.buffer.length < capacity) {
        let buffer = new Buffer(capacity);
        buf.buffer.copy(buffer);
        buf.buffer = buffer;
    }
    return buf;
};
/**
 * Reverses this ByteBuffer's contents.
 * @param {number=} begin Offset to start at, defaults to {@link ByteBuffer#offset}
 * @param {number=} end Offset to end at, defaults to {@link ByteBuffer#limit}
 * @returns {!ByteBuffer} this
 * @expose
 */
export function reverse(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    if (begin === end)
        return buf; // Nothing to reverse
    Array.prototype.reverse.call(buf.buffer.slice(begin, end));
    return buf;
};
/**
 * Skips the next `length` bytes. This will just advance
 * @param {number} length Number of bytes to skip. May also be negative to move the offset back.
 * @returns {!ByteBuffer} this
 * @expose
 */
export function skip(buf: ByteBuffer, length: number) {
    if (!buf.noAssert) {
        if (typeof length !== 'number' || length % 1 !== 0)
            throw TypeError("Illegal length: " + length + " (not an integer)");
        length |= 0;
    }
    let offset = buf.offset + length;
    if (!buf.noAssert) {
        if (offset < 0 || offset > buf.buffer.length)
            throw RangeError("Illegal length: 0 <= " + buf.offset + " + " + length + " <= " + buf.buffer.length);
    }
    buf.offset = offset;
    return buf;
};

/**
 * Slices this ByteBuffer by creating a cloned instance with `offset = begin` and `limit = end`.
 * @param {number=} begin Begin offset, defaults to {@link ByteBuffer#offset}.
 * @param {number=} end End offset, defaults to {@link ByteBuffer#limit}.
 * @returns {!ByteBuffer} Clone of this ByteBuffer with slicing applied, backed by the same {@link ByteBuffer#buffer}
 * @expose
 */
export function slice<T extends ByteBuffer>(buf: T, begin?: number, end?: number): T {
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    let bb = clone(buf);
    bb.offset = begin;
    bb.limit = end;
    return bb;
};
/**
 * Returns a copy of the backing buffer that contains this ByteBuffer's contents. Contents are the bytes between
 *  {@link ByteBuffer#offset} and {@link ByteBuffer#limit}.
 * @param {boolean=} forceCopy If `true` returns a copy, otherwise returns a view referencing the same memory if
 *  possible. Defaults to `false`
 * @returns {!Buffer} Contents as a Buffer
 * @expose
 */
export function toBuffer(buf: ByteBuffer, forceCopy?: boolean) {
    let offset = buf.offset,
        limit = buf.limit;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: Not an integer");
        offset >>>= 0;
        if (typeof limit !== 'number' || limit % 1 !== 0)
            throw TypeError("Illegal limit: Not an integer");
        limit >>>= 0;
        if (offset < 0 || offset > limit || limit > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + offset + " <= " + limit + " <= " + buf.buffer.length);
    }
    if (forceCopy) {
        let buffer = new Buffer(limit - offset);
        buf.buffer.copy(buffer, 0, offset, limit);
        return buffer;
    } else {
        if (offset === 0 && limit === buf.buffer.length)
            return buf.buffer;
        else
            return buf.buffer.slice(offset, limit);
    }
};

/**
 * Returns a copy of the backing buffer compacted to contain this ByteBuffer's contents. Contents are the bytes between
 *  {@link ByteBuffer#offset} and {@link ByteBuffer#limit}.
 * @returns {!ArrayBuffer} Contents as an ArrayBuffer
 */
export function toArrayBuffer(buf: ByteBuffer) {
    let offset = buf.offset,
        limit = buf.limit;
    if (!buf.noAssert) {
        if (typeof offset !== 'number' || offset % 1 !== 0)
            throw TypeError("Illegal offset: Not an integer");
        offset >>>= 0;
        if (typeof limit !== 'number' || limit % 1 !== 0)
            throw TypeError("Illegal limit: Not an integer");
        limit >>>= 0;
        if (offset < 0 || offset > limit || limit > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + offset + " <= " + limit + " <= " + buf.buffer.length);
    }
    let ab = new ArrayBuffer(limit - offset);
    // if (memcpy) { // Fast
    //     memcpy(ab, 0, buf.buffer, offset, limit);
    // } else { // Slow
    // return buf.buffer.buffer.slice(offset, limit);
    let dst = new Uint8Array(ab);
    for (var i = offset; i < limit; ++i)
        dst[i - offset] = buf.buffer[i];
    // }
    return ab;
};

/**
 * Converts the ByteBuffer's contents to a string.
 * @param {string=} encoding Output encoding. Returns an informative string representation if omitted but also allows
 *  direct conversion to "utf8", "hex", "base64" and "binary" encoding. "debug" returns a hex representation with
 *  highlighted offsets.
 * @param {number=} begin Offset to begin at, defaults to {@link ByteBuffer#offset}
 * @param {number=} end Offset to end at, defaults to {@link ByteBuffer#limit}
 * @returns {string} String representation
 * @throws {Error} If `encoding` is invalid
 * @expose
 */
export function toString(buf: ByteBuffer, encoding?: string, begin?: number, end?: number) {
    if (typeof encoding === 'undefined')
        return "ByteBufferNB(offset=" + buf.offset + ",markedOffset=" + buf.markedOffset + ",limit=" + buf.limit + ",capacity=" + capacity(buf) + ")";
    // if (typeof encoding === 'number')
    //     encoding = "utf8",
    //         begin = encoding,
    //         end = begin;
    switch (encoding) {
        case "utf8":
            return toUTF8(buf, begin, end);
        case "base64":
            return toBase64(buf, begin, end);
        case "hex":
            return toHex(buf, begin, end);
        case "binary":
            return toBinary(buf, begin, end);
        case "debug":
            return toDebug(buf);
        // case "columns":
        //     return toColumns(buf);
        default:
            throw Error("Unsupported encoding: " + encoding);
    }
};

// encodings/base64

/**
 * Encodes this ByteBuffer's contents to a base64 encoded string.
 * @param {number=} begin Offset to begin at, defaults to {@link ByteBuffer#offset}.
 * @param {number=} end Offset to end at, defaults to {@link ByteBuffer#limit}.
 * @returns {string} Base64 encoded string
 * @throws {RangeError} If `begin` or `end` is out of bounds
 * @expose
 */
export function toBase64(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined')
        begin = buf.offset;
    if (typeof end === 'undefined')
        end = buf.limit;
    begin = begin | 0; end = end | 0;
    if (begin < 0 || end > buf.capacity || begin > end)
        throw RangeError("begin, end");
    return buf.buffer.toString("base64", begin, end);
};

/**
 * Decodes a base64 encoded string to a ByteBuffer.
 * @param {string} str String to decode
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @returns {!ByteBuffer} ByteBuffer
 * @expose
 */
export function fromBase64(str: string, littleEndian?: boolean) {
    return wrap(new Buffer(str, "base64"), littleEndian);
};

/**
 * Encodes a binary string to base64 like `window.btoa` does.
 * @param {string} str Binary string
 * @returns {string} Base64 encoded string
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window.btoa
 * @expose
 */
export function btoa(str: string) {
    return toBase64(fromBinary(str));
};

/**
 * Decodes a base64 encoded string to binary like `window.atob` does.
 * @param {string} b64 Base64 encoded string
 * @returns {string} Binary string
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window.atob
 * @expose
 */
export function atob(b64: string) {
    return toBinary(fromBase64(b64));
};

// encodings/binary

/**
 * Encodes this ByteBuffer to a binary encoded string, that is using only characters 0x00-0xFF as bytes.
 * @param {number=} begin Offset to begin at. Defaults to {@link ByteBuffer#offset}.
 * @param {number=} end Offset to end at. Defaults to {@link ByteBuffer#limit}.
 * @returns {string} Binary encoded string
 * @throws {RangeError} If `offset > limit`
 * @expose
 */
export function toBinary(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined')
        begin = buf.offset;
    if (typeof end === 'undefined')
        end = buf.limit;
    begin |= 0; end |= 0;
    if (begin < 0 || end > capacity(buf) || begin > end)
        throw RangeError("begin, end");
    return buf.buffer.toString("binary", begin, end);
};

/**
 * Decodes a binary encoded string, that is using only characters 0x00-0xFF as bytes, to a ByteBuffer.
 * @param {string} str String to decode
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @returns {!ByteBuffer} ByteBuffer
 * @expose
 */
export function fromBinary(str: string, littleEndian?: boolean) {
    return wrap(new Buffer(str, "binary"), littleEndian);
};

// encodings/debug

/**
 * Encodes this ByteBuffer to a hex encoded string with marked offsets. Offset symbols are:
 * * `<` : offset,
 * * `'` : markedOffset,
 * * `>` : limit,
 * * `|` : offset and limit,
 * * `[` : offset and markedOffset,
 * * `]` : markedOffset and limit,
 * * `!` : offset, markedOffset and limit
 * @param {boolean=} columns If `true` returns two columns hex + ascii, defaults to `false`
 * @returns {string|!Array.<string>} Debug string or array of lines if `asArray = true`
 * @expose
 * @example `>00'01 02<03` contains four bytes with `limit=0, markedOffset=1, offset=3`
 * @example `00[01 02 03>` contains four bytes with `offset=markedOffset=1, limit=4`
 * @example `00|01 02 03` contains four bytes with `offset=limit=1, markedOffset=-1`
 * @example `|` contains zero bytes with `offset=limit=0, markedOffset=-1`
 */
export function toDebug(buf: ByteBuffer, columns?: boolean) {
    let i = -1,
        k = buf.buffer.length,
        b,
        hex = "",
        asc = "",
        out = "";
    while (i < k) {
        if (i !== -1) {
            b = buf.buffer[i];
            if (b < 0x10) hex += "0" + b.toString(16).toUpperCase();
            else hex += b.toString(16).toUpperCase();
            if (columns)
                asc += b > 32 && b < 127 ? String.fromCharCode(b) : '.';
        }
        ++i;
        if (columns) {
            if (i > 0 && i % 16 === 0 && i !== k) {
                while (hex.length < 3 * 16 + 3) hex += " ";
                out += hex + asc + "\n";
                hex = asc = "";
            }
        }
        if (i === buf.offset && i === buf.limit)
            hex += i === buf.markedOffset ? "!" : "|";
        else if (i === buf.offset)
            hex += i === buf.markedOffset ? "[" : "<";
        else if (i === buf.limit)
            hex += i === buf.markedOffset ? "]" : ">";
        else
            hex += i === buf.markedOffset ? "'" : (columns || (i !== 0 && i !== k) ? " " : "");
    }
    if (columns && hex !== " ") {
        while (hex.length < 3 * 16 + 3)
            hex += " ";
        out += hex + asc + "\n";
    }
    return columns ? out : hex;
};

/**
 * Decodes a hex encoded string with marked offsets to a ByteBuffer.
 * @param {string} str Debug string to decode (not be generated with `columns = true`)
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer} ByteBuffer
 * @expose
 * @see ByteBuffer#toDebug
 */
export function fromDebug(str: string, littleEndian?: boolean, noAssert?: boolean) {
    let k = str.length,
        bb = new ByteBuffer(((k + 1) / 3) | 0, littleEndian, noAssert);
    let i = 0, j = 0, ch, b,
        rs = false, // Require symbol next
        ho = false, hm = false, hl = false, // Already has offset (ho), markedOffset (hm), limit (hl)?
        fail = false;
    while (i < k) {
        switch (ch = str.charAt(i++)) {
            case '!':
                if (!noAssert) {
                    if (ho || hm || hl) {
                        fail = true;
                        break;
                    }
                    ho = hm = hl = true;
                }
                bb.offset = bb.markedOffset = bb.limit = j;
                rs = false;
                break;
            case '|':
                if (!noAssert) {
                    if (ho || hl) {
                        fail = true;
                        break;
                    }
                    ho = hl = true;
                }
                bb.offset = bb.limit = j;
                rs = false;
                break;
            case '[':
                if (!noAssert) {
                    if (ho || hm) {
                        fail = true;
                        break;
                    }
                    ho = hm = true;
                }
                bb.offset = bb.markedOffset = j;
                rs = false;
                break;
            case '<':
                if (!noAssert) {
                    if (ho) {
                        fail = true;
                        break;
                    }
                    ho = true;
                }
                bb.offset = j;
                rs = false;
                break;
            case ']':
                if (!noAssert) {
                    if (hl || hm) {
                        fail = true;
                        break;
                    }
                    hl = hm = true;
                }
                bb.limit = bb.markedOffset = j;
                rs = false;
                break;
            case '>':
                if (!noAssert) {
                    if (hl) {
                        fail = true;
                        break;
                    }
                    hl = true;
                }
                bb.limit = j;
                rs = false;
                break;
            case "'":
                if (!noAssert) {
                    if (hm) {
                        fail = true;
                        break;
                    }
                    hm = true;
                }
                bb.markedOffset = j;
                rs = false;
                break;
            case ' ':
                rs = false;
                break;
            default:
                if (!noAssert) {
                    if (rs) {
                        fail = true;
                        break;
                    }
                }
                b = parseInt(ch + str.charAt(i++), 16);
                if (!noAssert) {
                    if (isNaN(b) || b < 0 || b > 255)
                        throw TypeError("Illegal str: Not a debug encoded string");
                }
                bb.buffer[j++] = b;
                rs = true;
        }
        if (fail)
            throw TypeError("Illegal str: Invalid symbol at " + i);
    }
    if (!noAssert) {
        if (!ho || !hl)
            throw TypeError("Illegal str: Missing offset or limit");
        if (j < bb.buffer.length)
            throw TypeError("Illegal str: Not a debug encoded string (is it hex?) " + j + " < " + k);
    }
    return bb;
};

// encodings/hex

/**
 * Encodes this ByteBuffer's contents to a hex encoded string.
 * @param {number=} begin Offset to begin at. Defaults to {@link ByteBuffer#offset}.
 * @param {number=} end Offset to end at. Defaults to {@link ByteBuffer#limit}.
 * @returns {string} Hex encoded string
 * @expose
 */
export function toHex(buf: ByteBuffer, begin?: number, end?: number) {
    begin = typeof begin === 'undefined' ? buf.offset : begin;
    end = typeof end === 'undefined' ? buf.limit : end;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    return buf.buffer.toString("hex", begin, end);
};

/**
 * Decodes a hex encoded string to a ByteBuffer.
 * @param {string} str String to decode
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer} ByteBuffer
 * @expose
 */
export function fromHex(str: string, littleEndian?: boolean, noAssert?: boolean) {
    if (!noAssert) {
        if (typeof str !== 'string')
            throw TypeError("Illegal str: Not a string");
        if (str.length % 2 !== 0)
            throw TypeError("Illegal str: Length not a multiple of 2");
    }
    let bb = new ByteBuffer(0, littleEndian, true);
    bb.buffer = new Buffer(str, "hex");
    bb.limit = bb.buffer.length;
    return bb;
};

// encodings/utf8

/**
 * Encodes this ByteBuffer's contents between {@link ByteBuffer#offset} and {@link ByteBuffer#limit} to an UTF8 encoded
 *  string.
 * @returns {string} Hex encoded string
 * @throws {RangeError} If `offset > limit`
 * @expose
 */
export function toUTF8(buf: ByteBuffer, begin?: number, end?: number) {
    if (typeof begin === 'undefined') begin = buf.offset;
    if (typeof end === 'undefined') end = buf.limit;
    if (!buf.noAssert) {
        if (typeof begin !== 'number' || begin % 1 !== 0)
            throw TypeError("Illegal begin: Not an integer");
        begin >>>= 0;
        if (typeof end !== 'number' || end % 1 !== 0)
            throw TypeError("Illegal end: Not an integer");
        end >>>= 0;
        if (begin < 0 || begin > end || end > buf.buffer.length)
            throw RangeError("Illegal range: 0 <= " + begin + " <= " + end + " <= " + buf.buffer.length);
    }
    return buf.buffer.toString("utf8", begin, end);
};

/**
 * Decodes an UTF8 encoded string to a ByteBuffer.
 * @param {string} str String to decode
 * @param {boolean=} littleEndian Whether to use little or big endian byte order. Defaults to
 *  {@link DEFAULT_ENDIAN}.
 * @param {boolean=} noAssert Whether to skip assertions of offsets and values. Defaults to
 *  {@link DEFAULT_NOASSERT}.
 * @returns {!ByteBuffer} ByteBuffer
 * @expose
 */
export function fromUTF8(str: string, littleEndian?: boolean, noAssert?: boolean) {
    if (!noAssert)
        if (typeof str !== 'string')
            throw TypeError("Illegal str: Not a string");
    let bb = new ByteBuffer(0, littleEndian, noAssert);
    bb.buffer = new Buffer(str, "utf8");
    bb.limit = bb.buffer.length;
    return bb;
};


// /**
//  * node-memcpy. This is an optional binding dependency and may not be present.
//  * @function
//  * @param {!(Buffer|ArrayBuffer|Uint8Array)} target Destination
//  * @param {number|!(Buffer|ArrayBuffer)} targetStart Destination start, defaults to 0.
//  * @param {(!(Buffer|ArrayBuffer|Uint8Array)|number)=} source Source
//  * @param {number=} sourceStart Source start, defaults to 0.
//  * @param {number=} sourceEnd Source end, defaults to capacity.
//  * @returns {number} Number of bytes copied
//  * @throws {Error} If any index is out of bounds
//  * @expose
//  */
// export const memcpy = memcpy;

