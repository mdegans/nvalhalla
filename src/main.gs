/* mce.gs
 *
 * Copyright 2020 Michael de Gans
 *
 * Hail Satan, Xi Jinping looks like Winnie the Pooh
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

// indent = 0 uses tabs
[indent = 0]


namespace NValhalla

	// TODO(mdegans): define prefix at build time
	const PREFIX:string = "/usr/local"
	const MODEL_DIR:string = PREFIX + "/share/nvalhalla/models"
	const NVINFER_CONFIG_DIR:string = PREFIX + "/share/nvalhalla/nvinfer_configs"
	const SCRIPTS_DIR:string = PREFIX + "/share/nvalhalla/scripts"
	const DOT_TO_PDF_BASENAME:string = "dot_to_pdf.sh"
	const DOT_TO_PDF_ORIGIN:string = SCRIPTS_DIR + "/" + DOT_TO_PDF_BASENAME

	// exceptions
	exception SetupError
		DIR
		COPY

	exception ValidationError
		SINK_TYPE
		URI

	/**
	 * Create and return an app dir (~/.nvalhalla)
	 *
	 * @return a full path to an user app dir
	 */
	def ensure_nvalhalla_dir():string raises SetupError
		// TODO(mdegans): handle system user case with no homedir
		nvalhalla_dir:string = GLib.Path.build_filename(GLib.Environment.get_home_dir(), ".nvalhalla")
		ret:int = GLib.DirUtils.create_with_parents(nvalhalla_dir, 493)  // 493 == 0o755
		if ret != 0  // 0 == success
			raise new SetupError.DIR(@"could not create config dir(s) at $nvalhalla_dir")
		return nvalhalla_dir

	/**
	 * Create and return a configs dir (~/.nvalhalla/configs)
	 *
	 * @return a full path to a user config dir
	 */
	def ensure_config_dir():string raises SetupError
		config_dir:string = GLib.Path.build_filename(ensure_nvalhalla_dir(), "configs")
		ret:int = GLib.DirUtils.create_with_parents(config_dir, 493)  // 493 == 0o755
		if ret != 0  // 0 == success
			raise new SetupError.DIR(@"could not create config dir(s) at $config_dir")
		return config_dir

	/**
	 * Create and return a model dir (~/.nvalhalla/models)
	 *
	 * @return a full path to a user model dir
	 */
	def ensure_model_dir():string raises SetupError
		model_dir:string = GLib.Path.build_filename(ensure_nvalhalla_dir(), "models")
		ret:int = GLib.DirUtils.create_with_parents(model_dir, 493)
		if ret != 0
			raise new SetupError.DIR(@"could not create model dir(s) at $model_dir")
		return model_dir

	/**
	 * Setup environment variables and config dirs
	 */
	def static setup()
		// set the environment variable to dump dot files ~/.nvalhalla if not already defined
		try
			nvalhalla_dir:string = ensure_nvalhalla_dir()
			GLib.Environment.set_variable("GST_DEBUG_DUMP_DOT_DIR", nvalhalla_dir, false)
			dot_to_pdf_dest:string = GLib.Path.build_filename(nvalhalla_dir, DOT_TO_PDF_BASENAME)
			if not GLib.FileUtils.test(dot_to_pdf_dest, GLib.FileTest.EXISTS)
				sync_copy_file(DOT_TO_PDF_ORIGIN, dot_to_pdf_dest, null)
			ensure_config_dir()
			ensure_model_dir()
		except err:SetupError
			error("NValhalla setup failed because: %s\n", err.message)
		except err:Error
			error("NValhalla setup failed because: %s\n", err.message)

	/**
	 * Validates a supplied sink type is supported
	 */
	def validate_sink_type(val:string) raises ValidationError
		if val != "screen" and val != "rtsp"
			raise new ValidationError.SINK_TYPE(@"'$val' is not a valid --sink: must be 'screen' or 'rtsp'")

	/**
	 * validates a uri
	 */
	def validate_uri(val:string) raises ValidationError
		// i am guessing uridecodebin does this, but can't hurt
		// TODO: read uridecodebin source and check
		if GLib.Uri.parse_scheme(val) == null
			raise new ValidationError.URI(@"$val is not a valid uri")

	/**
	 * copy a file synchronously from source_filename to dest_filename
	 */
	def sync_copy_file(source_filename:string, dest_filename:string, flags:GLib.FileCopyFlags?) raises Error
		debug(@"copying $source_filename to $dest_filename")
		var source = GLib.File.new_for_path(source_filename)
		var dest = GLib.File.new_for_path(dest_filename)
		source.copy(dest, flags == null ? GLib.FileCopyFlags.NONE : flags , null, null)

	/**
	 * A signal handler class. Pass a Nvalhalla.App to the constructor and it will call .quit() on SIGINT.
	 */
	class SignalHandler: Object
		_app:App

		construct(app:App)
			self._app = app
			Unix.signal_add(Posix.Signal.INT, self.quit)

		def quit():bool
			print(@"Process $((int)Posix.getpid()) has received SIGINT, ending...")
			self._app.quit()
			return Source.REMOVE

	/**
	 * A class to store and validate arguments for Nvalhalla like a python namespace object returned by argparse
	 */
	class Args: Object
		prop readonly uris:array of string
		// prop readonly is syntactic sugar for a private _uris and a getter
		prop readonly sink_type:string?  // ? means nullable in Genie/Vala
		construct(uris:array of string, sink_type:string?) raises ValidationError
			if _sink_type != null
				validate_sink_type(_sink_type)
			for uri in _uris
				validate_uri(uri)
			self._uris = uris
			self._sink_type = sink_type

	/**
	 * An argument parser class for NValhalla a la argparse. Also initializes gstreamer.
	 */
	class ArgumentParser: Object
		[CCode (array_length = false, array_null_terminated = true)]
		uris:static array of string
		sink_type:static string?
		const options: array of OptionEntry = {
			{"uri", 0, 0, OptionArg.STRING_ARRAY, ref uris, "URI for uridecodebin", "URIS..."},
			{"sink", 0, 0, OptionArg.STRING, ref sink_type, "sink type ('screen' or 'rtsp' default 'screen')", "SINK"},
			{null}
		}

		description:string
		construct(description:string?)
			if description == null
				self.description = ""
		
		def parse_args(args:array of string): Args
			ret:Args
			try
				var opt_context = new GLib.OptionContext(self.description)
				opt_context.set_help_enabled(true)
				opt_context.add_main_entries(options, null)
				// add the option group from gstreame
				opt_context.add_group(Gst.init_get_option_group())
				opt_context.parse(ref args)
				ret = new Args(uris, sink_type)
			// todo: figure out the syntax for combining these (eg. except err:(OptionError, ValidationError))
			except err:OptionError
				error(err.message)
			except err:ValidationError
				error(err.message)
			return ret 


init
	// global setup
	NValhalla.setup()
	// create an argument parser
	var ap = new NValhalla.ArgumentParser("NValhalla live redaction demo")
	// "args" is an array of string (command line arguments) supplied to init (main() in C)
	var parsed_args = ap.parse_args(args)
	// create the app instance
	var app = new NValhalla.App(parsed_args, null)
	// attach a signal handler that will call quit() on the app
	var handler = new NValhalla.SignalHandler(app)
	// run the app
	app.run()
