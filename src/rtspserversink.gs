// Copyright (c) 2019, NVIDIA CORPORATION. All rights reserved.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

[indent = 0]

namespace NValhalla.Bins

	/**
	 * A {@link Gst.Bin} to be used a sink to serve RTSP.
	 *
	 * This is based on Nvidia's python code doing the same thing and uses 
	 * {@link Gst.RTSPServer} internally.
	 * 
	 * ''Note'': For the moment, this uses udpsink and udpsrc to transport
	 * video from the real end of the pipeline to the server so all of it's
	 * internals won't show in a .dot file or pdf.
	 */
	class RtspServerSink: Gst.Bin
		const UDP_HOST:string = "127.0.0.1"
		const UDP_PORT:int = 5400

		prop readonly uri:string

		// Bin elements
		converter:Gst.Element
		capsfilter:Gst.Element
		encoder:Gst.Element
		pay:Gst.Element
		queue:Gst.Element
		udpsink:Gst.Element

		//  RTSP server
		server:Gst.RTSPServer.Server
		factory:Gst.RTSPServer.MediaFactory

		// TODO(mdegans), add port parameter
		/** construct a new instance
		 *
		 * @param name a name for this or null for no name
		 */
		construct(name:string?)
			if name != null
				self.name = name

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
			//  create and add the encoder element
			self.encoder = Gst.ElementFactory.make("nvv4l2h264enc", "encoder")
			if self.encoder == null or not self.add(self.encoder)
				error(@"$(self.name) could not create or add encoder")
			self.encoder.set_property("bitrate", 4000000)
			// without these properties on tegra, the whole thing doesn't work
			// TODO(mdegans): read the docs on what these do
#if TEGRA
			self.encoder.set_property("preset-level", 1)
			self.encoder.set_property("insert-sps-pps", 1)
			self.encoder.set_property("bufapi-version", 1)
#endif
			// create and add the rtp pay element
			self.pay = Gst.ElementFactory.make("rtph264pay", "pay")
			if self.pay == null or not self.add(self.pay)
				error(@"$(self.name) could not create or add pay element")
			// create and add the queue element
			// TODO: experiment with queue placement
			self.queue = Gst.ElementFactory.make("queue", "queue")
			if self.queue == null or not self.add(self.queue)
				error(@"$(self.name) could not create or add queue element")

			self.udpsink = Gst.ElementFactory.make("udpsink", "udpsink")
			if self.udpsink == null or not self.add(self.udpsink)
				error(@"$(self.name) could not create or add udpsink element")
			self.udpsink.set_property("host", UDP_HOST)
			// TODO: check if port is in use and increment until finding unused
			self.udpsink.set_property("port", UDP_PORT)
			self.udpsink.set_property("async", false)
			self.udpsink.set_property("sync", true)

			//  Element.link_many() exists unlike Python, which is missing it for
			//  unknown reasons that are probbably good ones
			if not self.queue.link_many( \
					self.converter, \
					self.capsfilter, \
					self.encoder, \
					self.pay, \
					self.udpsink)  // trailing comma is not allowed in Genie :(
				error(@"$(self.name) could not link elements together")

			// ghost the sink rce pad to the outside of the bin
			inner_pad:Gst.Pad = self.queue.get_static_pad("sink")
			sink_pad:Gst.GhostPad = new Gst.GhostPad.from_template("sink", inner_pad, inner_pad.padtemplate)
			if sink_pad == null
				error(@"$(self.name) could not create ghost sink pad from $(self.queue.name)")
			if not self.add_pad(sink_pad)
				error(@"could not add $(sink_pad.name) ghost pad to $(self.name)")

			//  create the rtsp server
			self.server = new Gst.RTSPServer.Server()
			// this seems to have issues
			self.server.set_service("8554")
			// TODO(mdegans): this is returning -1 ... read docs for why
			//  rtsp_port:int = self.server.get_bound_port()
			// according to docs, this should be called last
			self.server.attach(null)

			// TODO(mdegans): make it easy to configure multicast, TLS
			// TODO(mdegans): modify RTSPServer source so the udp sources and sinks aren't necessary
			//  it would be nice if the factory could accept a pre-existing bin like self in this case
			self.factory = new Gst.RTSPServer.MediaFactory()
			self.factory.set_launch("( udpsrc name=pay0 port=5400 caps=\"application/x-rtp, media=video, clock-rate=90000, encoding-name=(string)H264, payload=96\" )")
			self.factory.set_shared(true)
			mounts:Gst.RTSPServer.MountPoints? = self.server.get_mount_points()
			if mounts == null
				error(@"$(self.name) could not get MountPoints from server.")
			mounts.add_factory("/nvalhalla", self.factory)

			self._uri = @"rtsp://$(GLib.Environment.get_host_name()):8554/nvalhalla"
			// TODO(mdegans): replace print with proper Gst logging
			debug(@"$(self.name) serving rtsp on $(self.uri)")
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self, Gst.DebugGraphDetails.ALL, @"$(self.name).construct_end")
