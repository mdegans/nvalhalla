/* validate.gs
 *
 * Copyright 2020 Michael de Gans
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE X CONSORTIUM BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Except as contained in this notice, the name(s) of the above copyright
 * holders shall not be used in advertising or otherwise to promote the sale,
 * use or other dealings in this Software without prior written
 * authorization.
 */

[indent = 0]

namespace NValhalla.Validate

	/**
	 * Validate a sink type. Log to the WARNING level if invalid.
	 * 
	 * @return `true` on valid sink type, else `false`
	 */
	def sink_type(type:string?): bool
		ret:bool
		case type
			when null, "screen", "rtsp", "youtube"
				ret = true
			default
				warning(@"'$type' is not a valid --sink: must be 'screen' or 'rtsp'")
				ret = false
		return ret


	/**
	 * Validate a uri. Log to the WARNING level if invalid.
	 *
	 * @return `true` on valid uri, else `false`
	 */
	def uri(val:string):bool
		if GLib.Uri.parse_scheme(val) == null
			warning(@"$val is not a valid uri")
			return false
		return true
