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

	class App: Object
		// TODO(mdegans): make this configurable
		const WIDTH:int = 1920
		const HEIGHT:int = 1080

		// app stuff
		_loop:GLib.MainLoop

		// pipeline and elements:
		_pipeline:Gst.Pipeline
		// a list of elements to iterate through, but perhaps some builtin of pipeline can be used instead:
		_sources:list of Gst.Element
		// plain old elements
		_muxer:Gst.Element
		_muxer_link_lock:GLib.Mutex
		_redact:NValhalla.Bins.Redactor
		_tiler:Gst.Element
		_sink:Gst.Element

		construct(args:NValhalla.Args, loop:GLib.MainLoop?)
			// assign or create a GLib Main Loop
			if loop != null
				self._loop = loop
			else
				self._loop = new GLib.MainLoop()

			// make the pipeline and connect the _on_message bus callback
			self._pipeline = new Gst.Pipeline(null)
			bus:Gst.Bus = self._pipeline.get_bus()
			bus.add_watch(GLib.Priority.DEFAULT, self._on_message)

			// make a new list of sources (Gee.ArrayList)
			self._sources = new list of Gst.Element

			// setup the stream muxer to link sources to
			self._muxer = Gst.ElementFactory.make("nvstreammux", "muxer")
			if self._muxer == null or not self._pipeline.add(self._muxer)
				error("failed to create or add stream muxer")
			self._muxer_link_lock = GLib.Mutex()

			// if no uris given try to make a camera source
			if args.uris.length == 0
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
				for uri in args.uris
					debug(@"adding: $uri")
					// TODO(mdegans): figure out how to get uridecodebin to skip audio streams
					// necessarily there is a way from browsing uridecodebin docs. needs experimenting
					src:Gst.Element = Gst.ElementFactory.make("uridecodebin", @"source_$i")
					if src == null
						warning(@"failed to create source for $uri")
						continue
					if not self._pipeline.add(src)
						warning(@"could not add $(src.name) to pipeline")
						// i think Vala might do this automatically but haven't checked the C
						src.unref()
						continue

					// set source properties
					src.set_property("uri", uri)
					src.set_property("caps", Gst.Caps.from_string("video/x-raw(ANY)"))
					src.set_property("expose-all-streams", false)
					src.set_property("async-handling", true)

					// connect the pad-added callback
					src.pad_added.connect(self._on_src_pad_added)

					// add the source to the _sources list
					// (this may be pointless since finding the children propery)
					self._sources.add(src)
					i++

			// raise an error if no sources have been created
			if self._sources.size == 0
				error("no sources could be created")

			// create a new redactor bin and set the batch size for the nvinfer element
			self._redact = new NValhalla.Bins.Redactor("redact")
			if self._redact == null or not self._pipeline.add(self._redact)
				error("failed to create or add Redactor bin")
			self._redact.set_property("batch-size", self._sources.size)

			// set up the multi-stream tiler
			self._tiler = Gst.ElementFactory.make("nvmultistreamtiler", "tiler")
			if self._tiler == null or not self._pipeline.add(self._tiler)
				error("could not create or add stream tiler")

			// calculate the number of columns and rows required:
			rows_and_columns:int = (int) Math.ceilf(Math.sqrtf((float) self._sources.size))

			self._tiler.set_property("rows", rows_and_columns)
			self._tiler.set_property("columns", rows_and_columns)
			self._tiler.set_property("width", WIDTH)
			self._tiler.set_property("height", HEIGHT)

			self._muxer.set_property("batch-size", 1)
			self._muxer.set_property("live-source", true)
			// TODO(mdegans): see if the scaling prior to inference helps or
			// hurts performance.
			self._muxer.set_property("width", WIDTH / rows_and_columns)
			self._muxer.set_property("height", HEIGHT / rows_and_columns)
			self._muxer.set_property("batched-push-timeout", 333670)  // 10 frames of 29.97 fps

			// add the sink
			if args.sink_type == null or args.sink_type == "screen" 
				debug(@"creating nvoverlay sink")
				self._sink = Gst.ElementFactory.make("nvoverlaysink", "sink")
				self._sink.set_property("qos", false)
			else if args.sink_type == "rtsp"
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
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).construct_end")

		def _try_linking(src_pad:Gst.Pad, sink_pad:Gst.Pad)
			// try to link the pads, check return, and warn if not OK and dump dot
			debug(@"trying to link $(src_pad.parent.name):$(src_pad.name) and $(sink_pad.parent.name):$(sink_pad.name)")
			debug(@"$(src_pad.name) CAPS: $(src_pad.caps.to_string())")
			debug(@"$(sink_pad.name) CAPS: $(sink_pad.caps.to_string())")
			ret:Gst.PadLinkReturn = src_pad.link(sink_pad)
			if ret == Gst.PadLinkReturn.OK
				return
			else
				Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).link_failure")
				error(@"pad link failed between $(src_pad.parent.name):$(src_pad.name) and $(sink_pad.parent.name):$(sink_pad.name) because $(ret.to_string())")


		def _on_src_pad_added(src:Gst.Element, src_pad:Gst.Pad)
			debug(@"got new pad $(src_pad.name) from $(src.name)")
			// if not a video/NVMM pad, reject it
			// https://valadoc.org/gstreamer-1.0/Gst.Pad.query_caps.html
			src_caps:Gst.Caps = src_pad.query_caps(null)
			src_pad_struct:weak Gst.Structure = src_caps.get_structure(0)
			src_pad_type:string = src_pad_struct.get_name()
			if not src_pad_type.has_prefix("video/x-raw")
				debug(@"$(src_pad.name) is not a video pad. skipping.")
				return

			// without this lock it's possible to request multiple identical pads like:
			// Padname sink_0 is not unique in element muxer, not adding
			debug(@"getting muxer lock for $(src.name)")
			self._muxer_link_lock.lock()
			debug(@"got muxer lock for $(src.name)")

			// this needs to be updated on pad added or flickering occurs with the osd
			//  debug(@"setting muxer batch-size to $(self._muxer.numsinkpads + 1)")
			//  self._muxer.set_property("batch-size", self._muxer.numsinkpads + 1)

			sink_pad_name:string = @"sink_$(self._muxer.numsinkpads)"
			debug(@"requesting pad $sink_pad_name")
			sink_pad:Gst.Pad = self._muxer.get_request_pad(sink_pad_name)
			if sink_pad == null
				error("could not request sink pad from multiqueue")

			self._try_linking(src_pad, sink_pad)

			debug(@"releasing muxer lock for $(src.name)")
			self._muxer_link_lock.unlock()
			debug(@"released muxer lock for $(src.name)")


		def _on_message(bus: Gst.Bus, message: Gst.Message) : bool
			// note: in Genie there is no fallthrough in a case block, so no need to break;
			case message.type
				when Gst.MessageType.QOS
				when Gst.MessageType.BUFFERING
				when Gst.MessageType.LATENCY
				when Gst.MessageType.ASYNC_DONE
				when Gst.MessageType.TAG
					break
				when Gst.MessageType.EOS
					GLib.message("Got EOS")
					self.quit()
				when Gst.MessageType.STATE_CHANGED
					old_state:Gst.State
					new_state:Gst.State
					message.parse_state_changed(out old_state, out new_state, null)
					debug(@"STATE_CHANGED:$(message.src.name):$(old_state.to_string())->$(new_state.to_string())")
				when Gst.MessageType.ERROR
					err:GLib.Error
					debug:string
					message.parse_error(out err, out debug)
					if err.code == 3  // window closed
						self.quit()
					error(@"$(err.code):$(err.message):$(debug)")
				when Gst.MessageType.WARNING
					err:GLib.Error
					debug:string
					message.parse_warning(out err, out debug)
					if err.code == 13
						// buffers being dropped spam
						break
					warning(@"$(err.code):$(err.message):$(debug)")
				default
					debug(@"BUS_MSG:$(message.src.name):$(message.type.get_name())")
			return true


		def run()
			self._pipeline.set_state(Gst.State.PLAYING)
			if not self._loop.is_running()
				self._loop.run()

		def quit()
			if self._loop.is_running()
				self._loop.quit()
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self._pipeline, Gst.DebugGraphDetails.ALL, @"$(self._pipeline.name).quit")
			self._pipeline.set_state(Gst.State.NULL)
