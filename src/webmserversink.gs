/* webmserversink.gs
 *
 * Copyright 2020 Michael de Gans
 *
 * dfc08be7d2e843a284d12c81f310d30feb4fe629993c45e1c0b0f5e6893c7f9f
 * c361d967af95872706da30fcc85de880ddbaeeed4438ffdaf97b514ea2522082
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


namespace NValhalla.Bins

	/**
	 * A {@link Gst.Bin} to be used a sink to serve Web-M encoded video
	 * in a format acceptable to a html5 video tag.
	 */
	class WebmServerSink: Gst.Bin
		const DEFAULT_HOST:string = "0.0.0.0"
		const DEFAULT_PORT:int = 8080

		prop readonly uri:string
		prop readonly codec:string

		// Bin elements
		converter:Gst.Element
		capsfilter:Gst.Element
		encoder:Gst.Element  // we use encodebin and the muxer is built
		queue:Gst.Element
		tcpsink:Gst.Element

		construct(name:string?)
			if name != null
				self.name = name
#if TX2_XAV
			self._codec = "vp9"
#else
			self._codec = "vp8"
#endif

			// create and add the converter element
			self.converter = Gst.ElementFactory.make("nvvideoconvert", "converter")
			if self.converter == null or not self.add(self.converter)
				error(@"$(self.name) could not create or add nvvidconv")
			// create and add the capsfilter element
			self.capsfilter = Gst.ElementFactory.make("capsfilter", "capsfilter")
			if self.capsfilter == null or not self.add(self.capsfilter)
				error(@"$(self.name) could not create or add capsfilter")
			self.capsfilter.set_property( \
				"caps", \
				Gst.Caps.from_string("video/x-raw(memory:NVMM), format=I420"))

			// create an encoding container profile (to configure encodebin)
			var prof = new Gst.PbUtils.EncodingContainerProfile( \
				"Webm video", "Standard vp8/vp9 video only", \
				Gst.Caps.from_string("video/webm") , null)
			// add a video profile to the container profile from the video caps
			prof.add_profile(new Gst.PbUtils.EncodingVideoProfile( \
				Gst.Caps.from_string(@"video/x-$(self.codec)"), null, null, 0))

			// create and add the encoder element
			self.encoder = Gst.ElementFactory.make("encodebin", "encoder")
			if self.encoder == null or not self.add(self.encoder)
				error(@"$(self.name) could not create or add $(self.codec) encoder")
			// set the profile
			self.encoder.set_property("profile", prof)

			self.queue = Gst.ElementFactory.make("queue", "queue")
			if self.queue == null or not self.add(self.queue)
				error(@"$(self.name) could not create or add queue element")

			self.tcpsink = Gst.ElementFactory.make("tcpserversink", "sink")
			if self.tcpsink == null or not self.add(self.tcpsink)
				error(@"$(self.name) could not create or add udpsink element")
			self.tcpsink.set_property("host", DEFAULT_HOST)
			self.tcpsink.set_property("port", DEFAULT_PORT)
			self.tcpsink.set_property("async", false)
			self.tcpsink.set_property("sync", true)

			// linking stage - link queue ! converter ! capsfilter
			if not self.queue.link_many(self.converter, self.capsfilter)
				error(@"$(self.name) could not link queue ! converter ! capsfilter")

			// linking stage - link capsfilter ! encoder
			capsfilter_src:Gst.Pad = self.capsfilter.get_static_pad("src")
			encoder_sink:Gst.Pad = self.encoder.get_compatible_pad(capsfilter_src, null)
			var ret = capsfilter_src.link(encoder_sink)
			if ret != Gst.PadLinkReturn.OK
				error(@"$(capsfilter_src.name) could not link to $(encoder_sink.name) because: $(ret.to_string())")
			
			if not self.encoder.link(self.tcpsink)
				error(@"$(self.name) could not link $(self.encoder.name) ! $(self.tcpsink.name)")

			// ghost the sink pad to the outside of the bin
			inner_pad:Gst.Pad = self.queue.get_static_pad("sink")
			sink_pad:Gst.GhostPad = new Gst.GhostPad.from_template("sink", inner_pad, inner_pad.padtemplate)
			if sink_pad == null
				error(@"$(self.name) could not create ghost sink pad from $(self.queue.name)")
			if not self.add_pad(sink_pad)
				error(@"could not add $(sink_pad.name) ghost pad to $(self.name)")
