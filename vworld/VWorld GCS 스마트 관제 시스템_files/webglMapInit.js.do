
		
		
		<!-- version : 3.0  2023-01-03. 조현석 부장. -->
		<!-- 웹지엘 엔진 버젼 업그레이드 후 API 반영  -->

		var v_protocol='';
		var vworldUrl='';
		var vworld2DCache='';
		var vworldBaseMapUrl='';
		var vworldStyledMapUrl='';
		var isUserDomain = '';
		if ( isUserDomain != null && isUserDomain != "" ) {
			var isHttps = isUserDomain.indexOf('https:');
			if ( isHttps < 0 ) {
				v_protocol="http://";
				vworldUrl='http://map.vworld.kr';
				vworld2DCache='http://2d.vworld.kr:8895/2DCache';
				vworldBaseMapUrl='http://cdn.vworld.kr:8080/2d';
				vworldStyledMapUrl='http://2d.vworld.kr:8895/stmap';
			} else {
				v_protocol="https://";
				vworldUrl='https://map.vworld.kr';
				vworld2DCache='https://2d.vworld.kr/2DCache';
				vworldBaseMapUrl='https://cdn.vworld.kr/2d';
				vworldStyledMapUrl='https://2d.vworld.kr/stmap';
			}
		} else {
			if(location.protocol == 'https:'){
				v_protocol="https://";
				vworldUrl='https://map.vworld.kr';
				vworld2DCache='https://2d.vworld.kr/2DCache';
				vworldBaseMapUrl='https://cdn.vworld.kr/2d';
				vworldStyledMapUrl='https://2d.vworld.kr/stmap';
			}else{
				v_protocol="http://";
				vworldUrl='http://map.vworld.kr';
				vworld2DCache='http://2d.vworld.kr:8895/2DCache';
				vworldBaseMapUrl='http://cdn.vworld.kr:8080/2d';
				vworldStyledMapUrl='http://2d.vworld.kr:8895/stmap';
			}
		}
		var vworldIsValid = 'true';
		var vworldErrMsg = '';
		var vworldApiKey = '307B0E17-0322-43C3-A570-59947C0FC7A1';
		var vworld3DUrl = '/js/webglMapInit.js.do';
		var vworldNoCss = 'n';
		var vworldVectorKey = '483E0418-2F46-3223-80A1-F66D16A24685';

		document.write("<script type=\'text/javascript\' src=\'" + vworldUrl + "/js/ws3dmap/WS3DRelease3/WSViewerStartup.js\'></script>");
		document.write("<script type=\'text/javascript\' src=\'" +  vworldUrl + "/js/ws3dmap/WS3DRelease3/VWViewerStartup.v30.min.js?ver=2026091801\'></script>");
		document.write("<script type=\'text/javascript\' src=\'" + vworldUrl + "/js/ws3dmap/WS3DRelease3/vw.ol3WebGL.v30.js?ver=2026091801\'></script>");