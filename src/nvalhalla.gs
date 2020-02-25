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


// https://mail.gnome.org/archives/vala-list/2017-August/msg00007.html
class SignalHandler
	_app:NValhalla

	construct(app:NValhalla)
		self._app = app

	def quit():bool
		print(@"Process $((int)Posix.getpid()) has received SIGINT, ending...")
		self._app.quit()
		return Source.REMOVE


class NValhalla: Object
	// app stuff
	_loop:GLib.MainLoop
	_handler:SignalHandler
	[CCode (array_length = false, array_null_terminated = true)]
	_uris: static array of string
	const _options: array of OptionEntry = {
		{"uri", 0, 0, OptionArg.STRING_ARRAY, ref _uris, "URI", "URIS..."},
		{null}
	}

	// pipeline and elements:
	_pipeline:Gst.Pipeline
	_sources:list of Gst.Element
	// may need to lock sources_linked
	_sources_linked:int
	_muxer:Gst.Element
	_tiler:Gst.Element
	_sink:Gst.Element

	construct(args:array of string, loop:GLib.MainLoop?)
		try
			var opt_context = new OptionContext ("- NValhalla stream player")
			opt_context.set_help_enabled (true)
			opt_context.add_main_entries (_options, null)
			opt_context.add_group(Gst.init_get_option_group())
			opt_context.parse (ref args)
		except e:OptionError
			error("%s\n", e.message)

		// assign or create a GLib Main Loop
		if loop != null
			self._loop = loop
		else
			self._loop = new GLib.MainLoop()

		// setup a new SignalHandler to quit the main loop
		self._handler = new SignalHandler(self)
		Unix.signal_add(Posix.Signal.INT, self._handler.quit)

		// make the pipeline and connect the _on_message bus callback
		// mdegans(todo: find out how to count instances in vala and append a count to the name)
		self._pipeline = new Gst.Pipeline(null)
		bus:Gst.Bus = self._pipeline.get_bus()
		bus.add_watch(GLib.Priority.DEFAULT, self._on_message)
		// bus gets unreferenced automatically at end of context (construct)

		// make a new list of sources (Gee.ArrayList)
		self._sources = new list of Gst.Element
		self._sources_linked = 0

		// setup the stream muxer to link sources to
		self._muxer = Gst.ElementFactory.make("nvstreammux", "muxer")
		if self._muxer == null or not self._pipeline.add(self._muxer)
			error("failed to create or add stream muxer")
		self._muxer.set_property("batch-size", 1)
		self._muxer.set_property("live-source", true)
		self._muxer.set_property("width", 1920)
		self._muxer.set_property("height", 1080)

		// if no uris given try to make a camera source
		if _uris.length == 0
			print("no --uris specified... using nvarguscamerasrc")
			camera:Gst.Element = Gst.ElementFactory.make("nvarguscamerasrc", "camera")
			if camera == null or not self._pipeline.add(camera)
				error("camera could not be created or added to pipeline")
			self._sources.add(camera)
			if not camera.link(self._muxer)
				error("camera could not be linked to stream muxer")

		// else, create a uridecodebin for each of the supplied sources
		else
			i:int = 0
			for uri in _uris
#if DEBUG
				debug(@"adding: $uri")
#endif
				src:Gst.Element = Gst.ElementFactory.make("uridecodebin", @"source_$i")
				if src == null or not self._pipeline.add(src)
					warning(@"failed to create source for $uri")
					continue
				src.set_property("uri", uri)
				src.pad_added.connect(self._on_pad_added)
				self._sources.add(src)
				i++
		// raise an error if no sources could be created
		if self._sources.size == 0
			error("no sources could be created")

		// TODO(mdegans): put inference elements here and set up callbacks

		// set up the multi-stream tiler
		self._tiler = Gst.ElementFactory.make("nvmultistreamtiler", "tiler")
		if self._tiler == null or not self._pipeline.add(self._tiler)
			error("could not create or add stream tiler")
		// calculate the number of columns and rows required:
		rows_and_columns:int = (int) Math.ceilf(Math.sqrtf((float) self._sources.size))
		self._tiler.set_property("rows", rows_and_columns)
		self._tiler.set_property("columns", rows_and_columns)
		self._tiler.set_property("width", 1920)
		self._tiler.set_property("height", 1080)

		// add the sink (overlaysink, because it always works)
		self._sink = Gst.ElementFactory.make("nvoverlaysink", "sink")
		if self._sink == null or not self._pipeline.add(self._sink)
			error("could not creat or add nvoverlaysink")

		// link everything (sources are linked to callback by muxer)
		if not self._muxer.link(self._tiler)
			error("could not mix stream muxer to tiler")
		if not self._tiler.link(self._sink)
			error("could not link stream tiler to sink")


	def _on_pad_added(src:Gst.Element, src_pad:Gst.Pad)
#if DEBUG
		debug(@"got new pad $(src_pad.name) from $(src.name)")
#endif
		sink_pad:Gst.Pad = self._muxer.get_request_pad(@"sink_$(self._sources_linked)")
		if sink_pad == null
			error("could not request sink pad from stream muxer")
		if not src_pad.can_link(sink_pad)
#if DEBUG
			// possibly incompatible
			debug(@"ignoring $(src_pad.name) becuase it cannot link to $(sink_pad.name)")
#endif
			return
		ret:Gst.PadLinkReturn = src_pad.link(sink_pad)
		if ret == Gst.PadLinkReturn.OK
			self._sources_linked++
			self._muxer.set_property("batch-size", self._sources_linked)
			return
		else
			error(@"pad link between $(src_pad.name) and $(sink_pad.name) failed because: $ret")


	def _on_message(bus: Gst.Bus, message: Gst.Message) : bool
		// note: in Genie there is no fallthrough in a case block, so no need to break;
		case message.type
			when Gst.MessageType.EOS
				GLib.message("Got EOS")
				self.quit()
			when Gst.MessageType.ERROR
				err:GLib.Error
				debug:string
				message.parse_error(out err, out debug)
				if err.code != 3  // window closed
					error(@"$(err.code):$(err.message):$(debug)")
				self.quit()
			when Gst.MessageType.WARNING
				err:GLib.Error
				debug:string
				message.parse_warning(out err, out debug)
				warning(@"$(err.code):$(err.message):$(debug)")
#if DEBUG
			default
				debug(@"BUS_MSG:$(message.src.name):$(message.type.get_name())")
#endif
		return true


	def run()
		self._pipeline.set_state(Gst.State.PLAYING)
		if not self._loop.is_running()
			self._loop.run()

	def quit()
		self._loop.quit()
		self._pipeline.set_state(Gst.State.NULL)
