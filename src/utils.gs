/* utils.gs
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

namespace NValhalla.Utils

	/**
	 * Copy a file synchronously from source_filename to dest_filename.
	 *
	 * To copy a file asynchronously, use the {@link GLib.File} interface 
	 * directly.
	 *
	 * @throws Error on failure to copy a file
	 */
	def sync_copy_file(source_filename:string, dest_filename:string, flags:GLib.FileCopyFlags?) raises Error
		debug(@"copying $source_filename to $dest_filename")
		var source = GLib.File.new_for_path(source_filename)
		var dest = GLib.File.new_for_path(dest_filename)
		source.copy(dest, flags == null ? GLib.FileCopyFlags.NONE : flags , null, null)

	/**
	 * Make a directory(s) using {@link GLib.DirUtils.create_with_parents} in
	 * mode 0o755
	 *
	 * @throws GLib.FileError.FAILED on failure to create directory
	 */
	def mkdirs(dir:string) raises GLib.FileError
		ret:int = GLib.DirUtils.create_with_parents(dir, 493)  // 493 == 0o755
		if ret != 0  // 0 == success
			raise new GLib.FileError.FAILED( \
				@"could not create dir(s) at $dir");

	// TODO(mdegans): a full GObject is possibly unnecessary here. find an
	// alternative
	/**
	 * A signal handler class for {@link NValhalla.App}.
	 *
	 * https://mail.gnome.org/archives/vala-list/2017-August/msg00007.html
	 *
	 * Pass a {@link Nvalhalla.App} to the constructor and it will call 
	 * {@link NValhalla.App.quit} on SIGINT.
	 */
	class SignalHandler: Object
		_app:NValhalla.App
		/**
		 * The id of signal handler returned by {@link GLib.Unix.signal_add}
		 */
		prop readonly id:uint

		/**
		 * Create a new instance of {@link NValhalla.Utils.SignalHandler].
		 *
		 * @param app an instance of {@link NValhalla.App} to quit on SIGINT.
		 */
		construct(app:NValhalla.App)
			self._app = app
			self._id = Unix.signal_add(Posix.Signal.INT, self._quit)

		def _quit():bool
			print(@"Process $((int)Posix.getpid()) has received SIGINT, ending...")
			self._app.quit()
			return Source.REMOVE
