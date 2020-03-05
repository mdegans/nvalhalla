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

[indent = 0]

namespace NValhalla

	// https://mail.gnome.org/archives/vala-list/2017-August/msg00007.html
	class SignalHandler
		_app:App

		construct(app:App)
			self._app = app

		def quit():bool
			print(@"Process $((int)Posix.getpid()) has received SIGINT, ending...")
			self._app.quit()
			return Source.REMOVE

	class App: Object
		// TODO(mdegans): move all this outside the App so args are parsed outside

		// app stuff
		_loop:GLib.MainLoop
		_handler:SignalHandler
		[CCode (array_length = false, array_null_terminated = true)]
		_uris:static array of string
		_sink_type:static string?  // ? means nullable in Genie/Vala
		const _options: array of OptionEntry = {
			{"uri", 0, 0, OptionArg.STRING_ARRAY, ref _uris, "URI for uridecodebin", "URIS..."},
			{"sink", 0, 0, OptionArg.STRING, ref _sink_type, "sink type ('screen' or 'rtsp' default 'screen')", "SINK"},
			{null}
		}

		def static validate_sink_type(val:string)
			if val != "screen" and val != "rtsp"
				error(@"'$val' is not a valid --sink: must be 'screen' or 'rtsp'")

		def static validate_uri(val:string)
			// i am guessing uridecodebin does this, but can't hurt
			// TODO: read uridecodebin source and check
			if GLib.Uri.parse_scheme(val) == null
				error(@"$val is not a valid uri")

		// pipeline and elements:
		_pipeline:Gst.Pipeline
		// a list of elements to iterate through, but perhaps some builtin of pipeline can be used instead:
		_sources:list of Gst.Element
		// plain old elements
		_muxer:Gst.Element
		_muxer_link_lock:GLib.Mutex
		_redact:NValhalla.Bins.Redaction
		_tiler:Gst.Element
		_sink:Gst.Element

		construct(args:array of string, loop:GLib.MainLoop?)
			try
				var opt_context = new OptionContext ("- NValhalla stream redactor")
				opt_context.set_help_enabled (true)
				opt_context.add_main_entries (_options, null)
				opt_context.add_group(Gst.init_get_option_group())
				opt_context.parse (ref args)
			except e:OptionError
				error("%s\n", e.message)
			// todo: implement proper GLib way to do this
			// having trouble figuring out OptionArg.CALLBACK
			// proper way is to throw an error whiw is caught and repored above
			// https://valadoc.org/glib-2.0/GLib.Error.html
			if _sink_type != null
				validate_sink_type(_sink_type)
			for uri in _uris
				validate_uri(uri)

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

			// setup the stream muxer to link sources to
			self._muxer = Gst.ElementFactory.make("nvstreammux", "muxer")
			if self._muxer == null or not self._pipeline.add(self._muxer)
				error("failed to create or add stream muxer")
			self._muxer.set_property("batch-size", 1)
			self._muxer.set_property("live-source", true)
			self._muxer.set_property("width", 960)
			self._muxer.set_property("batched-push-timeout", 333670)  // 10 frames of 29.97 fps
			self._muxer.set_property("height", 540)
			self._muxer_link_lock = GLib.Mutex()

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
					// TODO(mdegans): figure out how to get uridecodebin to skip audio streams
					// necessarily there is a way from browsing uridecodebin docs. needs experimenting
					src:Gst.Element = Gst.ElementFactory.make("uridecodebin", @"source_$i")
					if src == null or not self._pipeline.add(src)
						warning(@"failed to create source for $uri")
						continue
					src.set_property("uri", uri)
					src.pad_added.connect(self._on_src_pad_added)
					self._sources.add(src)
					i++

			// raise an error if no sources have been created
			if self._sources.size == 0
				error("no sources could be created")

			// create a new redaction bin and set the batch size for the nvinfer element
			self._redact = new NValhalla.Bins.Redaction("redact", null, self._sources.size)
			if self._redact == null or not self._pipeline.add(self._redact)
				error("failed to create or add redaction bin")

			// the .num_sources setter updates the batch-size and expected engine filename
			self._redact.num_sources = self._sources.size

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

			// add the sink
			if _sink_type == null or _sink_type == "screen" 
				debug(@"creating nvoverlay sink")
				self._sink = Gst.ElementFactory.make("nvoverlaysink", "sink")
			else if _sink_type == "rtsp"
				debug(@"creating a rtsp sink bin for")
				self._sink = new NValhalla.Bins.RtspServerSink("rtspsink");
			else
				warning(@"--sink validator is broken. please report.")
			if self._sink == null or not self._pipeline.add(self._sink)
				error("could not create or add sink")

			// link everything: (sources are linked to callback by muxer)
			if not self._muxer.link(self._redact)
				error("could not mix stream muxer to redaction bin")
			if not self._redact.link(self._tiler)
				error("could ont link redaction bin to stream tiler")
			// test linkage: (no inference)
			//  self._muxer.link(self._tiler)
			if not self._tiler.link(self._sink)
				error("could not link stream tiler to sink")
#if DEBUG
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).construct_end")
#endif

		def _try_linking(src_pad:Gst.Pad, sink_pad:Gst.Pad)
			// try to link the pads, check return, and warn if not OK and dump dot
			ret:Gst.PadLinkReturn = src_pad.link(sink_pad)
			if ret == Gst.PadLinkReturn.OK
				return
			else
				Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).link_failure")
				warning(@"$(src_pad.name) CAPS: $(src_pad.caps.to_string())")
				warning(@"$(sink_pad.name) CAPS: $(sink_pad.caps.to_string())")
				error(@"pad link failed between $(src_pad.parent.name):$(src_pad.name) and $(sink_pad.parent.name):$(sink_pad.name) because $(ret.to_string())")


		def _on_src_pad_added(src:Gst.Element, src_pad:Gst.Pad)
#if DEBUG
			debug(@"got new pad $(src_pad.name) from $(src.name)")
#endif
			// if not a video/NVMM pad, reject it
			// https://valadoc.org/gstreamer-1.0/Gst.Pad.query_caps.html
			src_caps:Gst.Caps = src_pad.query_caps(null)
			src_pad_struct:weak Gst.Structure = src_caps.get_structure(0)
			src_pad_type:string = src_pad_struct.get_name()
			if not src_pad_type.has_prefix("video/x-raw")
#if DEBUG
				debug(@"$(src_pad.name) is not a video pad. skipping.")
#endif
				return

			self._muxer_link_lock.lock()
			// get a sink pad from the multiqueue
			sink_pad:Gst.Pad = self._muxer.get_request_pad(@"sink_$(self._muxer.numsinkpads)")
			if sink_pad == null
				error("could not request sink pad from multiqueue")

			self._try_linking(src_pad, sink_pad)

			// this needs to be updated on pad added or flickering occurs with the osd
			self._muxer.set_property("batch-size", self._muxer.numsinkpads)

			self._muxer_link_lock.unlock()


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
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).quit")
			self._pipeline.set_state(Gst.State.NULL)
