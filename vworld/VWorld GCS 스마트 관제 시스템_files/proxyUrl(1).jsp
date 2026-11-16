



// 도로 스타일 관련
// 버전 : 20240610

var renderedFeatures = {};

function fnKaisStyle(f, r) {
	let layerName = f.getProperties()['layer']
	if (layerName.indexOf('nsid_data') > -1) {
		layerName = layerName.replace('nsid_data.', '');
	}
	zoom = Math.floor(map2d.getView().getZoom()).toFixed();
	styleVal = {}
	
	switch(layerName) {
		/*case 'vl_ex_subwsta_l_nm_1515':
			if (zoom == 16) {
				var lineName = f.getProperties()['line_name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default: return null;
				}
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '8px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 55
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_subwsta_l_nm_1616':
			if (zoom == 17) {
				var lineName = f.getProperties()['line_name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default: return null;
				}
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 54
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_subwsta_l_nm_1718':
			if (zoom >= 18 && zoom <= 19) {
				var lineName = f.getProperties()['line_name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default: return null;
				}
				
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '10px NanumGothicOTF ExtraBold',
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 53
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}*/
		case 'vl_ex_subwln_l_nm_1414':
			if (zoom == 15) {
				var lineName = f.getProperties()['name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default:
						return null;
				}
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '8px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 52
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_ssubwln_l_nm_1516':
			if (zoom >= 16 && zoom <= 17) {
				var lineName = f.getProperties()['name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default:
						return null;
				}
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '8px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 51
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_ssubwln_l_nm_1718':
			if (zoom >= 18 && zoom <= 19) {
				var lineName = f.getProperties()['name'];
				var strokeColor = '#fff';
				
				switch(lineName) {
					case '서울1호선': strokeColor='#0052a4';break;
					case '서울2호선': strokeColor='#00a84d';break;
					case '서울3호선': strokeColor='#ef7c1c';break;
					case '서울4호선': strokeColor='#00a4e3';break;
					case '서울5호선': strokeColor='#996cac';break;
					case '서울6호선': strokeColor='#cd7c2f';break;
					case '서울7호선': strokeColor='#747f00';break;
					case '서울8호선': strokeColor='#e6106b';break;
					case '서울9호선': strokeColor='#bdb092';break;
					case '경강선': strokeColor='#005bac';break;
					case '경의중앙선': strokeColor='#77c4a3';break;
					case '경춘선': strokeColor='#0c8e72';break;
					case '공항철도': strokeColor='#0090d2';break;
					case '수인분당선': strokeColor='#fabe00';break;
					case '신분당선': strokeColor='#d4003b';break;
					case '에버라인': strokeColor='#5cb531';break;
					case '의정부경전철': strokeColor='#f8b100';break;
					case '인천공항자기부상철도': strokeColor='#ffcd12';break;
					case '인천1호선': strokeColor='#97bbdf';break;
					case '인천2호선': strokeColor='#f39800';break;
					case '광주1호선': strokeColor='#009088';break;
					case '대구1호선': strokeColor='#d93f5c';break;
					case '대구2호선': strokeColor='#00aa80';break;
					case '대구3호선': strokeColor='#ffb100';break;
					case '대전1호선': strokeColor='#007448';break;
					case '부산1호선': strokeColor='#f06a00';break;
					case '부산2호선': strokeColor='#81bf48';break;
					case '부산3호선': strokeColor='#bb8c00';break;
					case '부산4호선': strokeColor='#217dcb';break;
					case '부산경전철': strokeColor='#8652a1';break;
					case '우이신설선': strokeColor='#b0ce18';break;
					case '동해선': strokeColor='#003da5';break;
					case '서해선': strokeColor='#81a914';break;
					case '김포골드라인': strokeColor='#a17800';break;
					case '신림선': strokeColor='#6789ca';break;
					default:
						return null;
				}
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: strokeColor,
								width: 1
							})
						}),
						zIndex: 50
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_snexrd_l_nm_0816': 
			var s_level = parseInt(f.getProperties()['s_level']);
			if (zoom == 17 && s_level == 12) {
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 16 && s_level == 12) {
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 15 && s_level == 12) {
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 14 && s_level == 12) {
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 13 && s_level == 12) {
				styleVal = {
						stroke: null,
						text: new ol.style.Text({
							font: '11px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 12 && s_level == 11) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 11 && s_level == 10) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 10 && s_level == 9) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 9 && s_level == 8) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 49
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_hwrdcenl_l_nm_0818': 
			var s_level = parseInt(f.getProperties()['s_level']);
			if (zoom == 19 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 18 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 17 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 16 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 15 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 14 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '12px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 13 && s_level == 12) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '11px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 12 && s_level == 11) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 11 && s_level == 10) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 10 && s_level == 9) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 9 && s_level == 8) {
				styleVal = {
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 48
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_cityhwrdcenl_l_nm_0818': 
			var s_level = parseInt(f.getProperties()['s_level']);
			if (zoom == 19 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '12px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 18 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '12px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 17 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '12px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 16 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '12px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 15 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '11px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 14 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '11px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 13 && s_level == 12) {
				styleVal = {
					stroke: null,
					text: new ol.style.Text({
						font: '11px NanumGothicOTF ExtraBold',
						scale: 1,
						text: getLabel(f, 'lb_name_k'),
						placement: 'line',
						maxAngle: 25,
						fill: new ol.style.Fill({
							color: '#ffffff'
						}),
						stroke: new ol.style.Stroke({
							color: '#a76e33',
							width: 1
						})
					}),
					zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 12 && s_level == 11) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 11 && s_level == 10) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 10 && s_level == 9) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else if (zoom == 9 && s_level == 8) {
				styleVal = {
					stroke: null,
						text: new ol.style.Text({
							font: '9px NanumGothicOTF ExtraBold',
							scale: 1,
							text: getLabel(f, 'lb_name_k'),
							placement: 'line',
							maxAngle: 25,
							fill: new ol.style.Fill({
								color: '#ffffff'
							}),
							stroke: new ol.style.Stroke({
								color: '#a76e33',
								width: 1
							})
						}),
						zIndex: 47
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_subwa_a_1518':
			if(zoom >= 16 && zoom <= 19) {
				var lineName = f.getProperties()['line_name'];
				var opacity = 0.7;
				var polyFill = '#ffffff';
				
				switch(lineName) {
					case '서울지하철1호선': polyFill='rgba(0, 82, 164, 0.6)';break;
					case '서울지하철2호선': polyFill='rgba(0, 168, 77, 0.6)';break;
					case '서울지하철3호선': polyFill='rgba(239, 124, 28, 0.6)';break;
					case '서울지하철4호선': polyFill='rgba(0, 164, 227, 0.6)';break;
					case '서울지하철5호선': polyFill='rgba(153, 108, 172, 0.6)';break;
					case '서울지하철6호선': polyFill='rgba(205, 124, 47, 0.6)';break;
					case '서울지하철7호선': polyFill='rgba(116, 127, 0, 0.6)';break;
					case '서울지하철8호선': polyFill='rgba(230, 16, 107, 0.6)';break;
					case '서울지하철9호선': polyFill='rgba(189, 176, 146, 0.6)';break;
					case '경강선': polyFill='rgba(0, 91, 172, 0.6)';break;
					case '경의중앙선': polyFill='rgba(119, 196, 163, 0.6)';break;
					case '경춘선': polyFill='rgba(12, 142, 114, 0.6)';break;
					case '공항철도': polyFill='rgba(0, 144, 210, 0.6)';break;
					case '수인분당선': polyFill='rgba(250, 190, 0, 0.6)';break;
					case '신분당선': polyFill='rgba(212, 0, 59, 0.6)';break;
					case '에버라인': polyFill='rgba(92, 181, 49, 0.6)';break;
					case '의정부경전철': polyFill='rgba(248, 177, 0, 0.6)';break;
					case '인천공항자기부상철도': polyFill='rgba(255, 205, 18, 0.6)';break;
					case '인천지하철1호선': polyFill='rgba(151, 187, 223, 0.6)';break;
					case '인천지하철2호선': polyFill='rgba(243, 152, 0, 0.6)';break;
					case '광주지하철1호선': polyFill='rgba(0, 144, 136, 0.6)';break;
					case '대구지하철1호선': polyFill='rgba(217, 63, 92, 0.6)';break;
					case '대구지하철2호선': polyFill='rgba(0, 170, 128, 0.6)';break;
					case '대구지하철3호선': polyFill='rgba(255, 177, 0, 0.6)';break;
					case '대전지하철1호선': polyFill='rgba(0, 116, 72, 0.6)';break;
					case '부산지하철1호선': polyFill='rgba(240, 106, 0, 0.6)';break;
					case '부산지하철2호선': polyFill='rgba(129, 191, 72, 0.6)';break;
					case '부산지하철3호선': polyFill='rgba(187, 140, 0, 0.6)';break;
					case '부산지하철4호선': polyFill='rgba(33, 125, 203, 0.6)';break;
					case '부산경전철': polyFill='rgba(134, 82, 161, 0.6)';break;
					case '우이신설선': polyFill='rgba(176, 206, 24, 0.6)';break;
					case '동해선': polyFill='rgba(0, 61, 165, 0.6)';break;
					case '서해선': polyFill='rgba(129, 169, 20, 0.6)';break;
					case '김포골드라인': polyFill='rgba(161, 120, 0, 0.6)';break;
					case '신림선': polyFill='rgba(103, 137, 202, 0.6)';break;
					default: return null;
				}
				styleVal = {
						fill: new ol.style.Fill({
							color: polyFill,
							opacity: opacity
						}),
						zIndex: 46
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_subwln_l_1214':
			if(zoom >= 13 && zoom <= 15) {
				var lineName = f.getProperties()['name'];
				var lineWidth = 2;
				var lineColor =  '#fff';
				
				switch(lineName) {
					case '서울1호선': lineColor='#0052a4';break;
					case '서울2호선': lineColor='#00a84d';break;
					case '서울3호선': lineColor='#ef7c1c';break;
					case '서울4호선': lineColor='#00a4e3';break;
					case '서울5호선': lineColor='#996cac';break;
					case '서울6호선': lineColor='#cd7c2f';break;
					case '서울7호선': lineColor='#747f00';break;
					case '서울8호선': lineColor='#e6106b';break;
					case '서울9호선': lineColor='#bdb092';break;
					case '경강선': lineColor='#005bac';break;
					case '경의중앙선': lineColor='#77c4a3';break;
					case '경춘선': lineColor='#0c8e72';break;
					case '공항철도': lineColor='#0090d2';break;
					case '수인분당선': lineColor='#fabe00';break;
					case '신분당선': lineColor='#d4003b';break;
					case '에버라인': lineColor='#5cb531';break;
					case '의정부경전철': lineColor='#f8b100';break;
					case '인천공항자기부상철도': lineColor='#ffcd12';break;
					case '인천1호선': lineColor='#97bbdf';break;
					case '인천2호선': lineColor='#f39800';break;
					case '광주1호선': lineColor='#009088';break;
					case '대구1호선': lineColor='#d93f5c';break;
					case '대구2호선': lineColor='#00aa80';break;
					case '대구3호선': lineColor='#ffb100';break;
					case '대전1호선': lineColor='#007448';break;
					case '부산1호선': lineColor='#f06a00';break;
					case '부산2호선': lineColor='#81bf48';break;
					case '부산3호선': lineColor='#bb8c00';break;
					case '부산4호선': lineColor='#217dcb';break;
					case '부산경전철': lineColor='#8652a1';break;
					case '우이신설선': lineColor='#b0ce18';break;
					case '동해선': lineColor='#003da5';break;
					case '서해선': lineColor='#81a914';break;
					case '김포골드라인': lineColor='#a17800';break;
					case '신림선': lineColor='#6789ca';break;
					default:
						return null;
				}
				styleVal = {
						stroke: new ol.style.Stroke({
							color: lineColor,
							width: lineWidth
						}),
						zIndex: 45
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_ssubwln_l_1518':
			if(zoom >= 16 && zoom <= 19) {
				var lineName = f.getProperties()['name'];
				var lineWidth = 2.25;
				var lineColor =  '#fff';
				
				switch(lineName) {
					case '서울1호선': lineColor='#0052a4';break;
					case '서울2호선': lineColor='#00a84d';break;
					case '서울3호선': lineColor='#ef7c1c';break;
					case '서울4호선': lineColor='#00a4e3';break;
					case '서울5호선': lineColor='#996cac';break;
					case '서울6호선': lineColor='#cd7c2f';break;
					case '서울7호선': lineColor='#747f00';break;
					case '서울8호선': lineColor='#e6106b';break;
					case '서울9호선': lineColor='#bdb092';break;
					case '경강선': lineColor='#005bac';break;
					case '경의중앙선': lineColor='#77c4a3';break;
					case '경춘선': lineColor='#0c8e72';break;
					case '공항철도': lineColor='#0090d2';break;
					case '수인분당선': lineColor='#fabe00';break;
					case '신분당선': lineColor='#d4003b';break;
					case '에버라인': lineColor='#5cb531';break;
					case '의정부경전철': lineColor='#f8b100';break;
					case '인천공항자기부상철도': lineColor='#ffcd12';break;
					case '인천1호선': lineColor='#97bbdf';break;
					case '인천2호선': lineColor='#f39800';break;
					case '광주1호선': lineColor='#009088';break;
					case '대구1호선': lineColor='#d93f5c';break;
					case '대구2호선': lineColor='#00aa80';break;
					case '대구3호선': lineColor='#ffb100';break;
					case '대전1호선': lineColor='#007448';break;
					case '부산1호선': lineColor='#f06a00';break;
					case '부산2호선': lineColor='#81bf48';break;
					case '부산3호선': lineColor='#bb8c00';break;
					case '부산4호선': lineColor='#217dcb';break;
					case '부산경전철': lineColor='#8652a1';break;
					case '우이신설선': lineColor='#b0ce18';break;
					case '동해선': lineColor='#003da5';break;
					case '서해선': lineColor='#81a914';break;
					case '김포골드라인': lineColor='#a17800';break;
					case '신림선': lineColor='#6789ca';break;
					default:
						return null;
				}
				styleVal = {
						stroke: new ol.style.Stroke({
							color: lineColor,
							width: lineWidth
						}),
						zIndex: 44
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_nsta_a_1316': 
			if(zoom >= 14 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							color: '#969696'
						}),
						stroke: new ol.style.Stroke({
							color: '#969696',
							width: 1
						}),
						zIndex: 43
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_nrail_l_1116': 
			if(zoom >= 12 && zoom < 18) {
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#b8b8b8',
						width: 1
					}),
					zIndex: 42
				});
				var styles = [
					new ol.style.Style({
						stroke: new ol.style.Stroke({
							color: '#b8b8b8',
							width: 4,
							lineDash: [1, 20],
							lineCap: 'butt',
							lineJoin: 'bevel'
						}),
						// Offset geometry
						geometry: function (feature) {
							return offsetGeometry(f, 1.17 * r);
						},
						zIndex: 40
					}),
					new ol.style.Style({
						stroke: new ol.style.Stroke({
							color: '#b8b8b8',
							width: 4,
							lineDash: [1, 20],
							lineCap: 'butt',
							lineJoin: 'bevel'
						}),
						// Offset geometry
						geometry: function (feature) {
							return offsetGeometry(f, -1.17 * r);
						},
						zIndex: 41
					}),
					inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_nplatform_a_1116': 
			if(zoom >= 12 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							color: '#969696'
						}),
						stroke: new ol.style.Stroke({
							color: '#969696',
							width: 1
						}),
						zIndex: 39
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_arwfc_1618': 
			if(zoom >= 17 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#e1e1e1',
							color: 'rgba(225, 225, 225, 0.25)'
							//opacity: 0.75
						}),
						stroke: new ol.style.Stroke({
							color: '#b2b2b2',
							width: 1,
							opacity: 0.75
						}),
						zIndex: 38
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_rlroad_ctln_1118': 
			if(zoom >= 12 && zoom < 20) {
				var rlroadSe = f.getProperties()['rlroad_se'];
				var rlwtySe = f.getProperties()['rlwty_se'];
			
				if (rlroadSe == 'RRC001' && rlwtySe == 'RRT001') {
					styleVal = {
						stroke: new ol.style.Stroke({
							color: '#000000',
							width: 2.5
						}),
						stroke: new ol.style.Stroke({
							color: '#ffffff',
							width: 2.5,
							lineDash: [20, 20]
						}),
						zIndex: 37
					};
					
					return new ol.style.Style(styleVal);
				}
				else if (rlroadSe == 'RRC002' && rlwtySe == 'RRT001') {
					var inStyle = new ol.style.Style({
						stroke: new ol.style.Stroke({
							color: '#b8b8b8',
							width: 1
						}),
						zIndex: 37
					});
					var styles = [
						new ol.style.Style({
							stroke: new ol.style.Stroke({
								color: '#b8b8b8',
								width: 4.5,
								lineDash: [1, 20],
								lineCap: 'butt',
								lineJoin: 'bevel'
							}),
							// Offset geometry
							geometry: function (feature) {
								return offsetGeometry(f, 1.17 * r);
							},
							zIndex: 35
						}),
						new ol.style.Style({
							stroke: new ol.style.Stroke({
								color: '#b8b8b8',
								width: 4.5,
								lineDash: [1, 20],
								lineCap: 'butt',
								lineJoin: 'bevel'
							}),
							// Offset geometry
							geometry: function (feature) {
								return offsetGeometry(f, -1.17 * r);
							},
							zIndex: 36
						}),
						inStyle]
					return styles;					
				}
			}
			else {
				return null;
			}
		case 'vl_ex_ntunl_a_1516': 
			if(zoom >= 16 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#e1e1e1',
							color: 'rgba(225, 225, 225, 0.3)'
							//opacity: 0.7
						}),
						zIndex: 34
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_nbrdg_a_1516': 
			if(zoom >= 16 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#eae6d0',
							color: 'rgba(234, 230, 208, 0.3)'
							//opacity: 0.7
						}),
						stroke: new ol.style.Stroke({
							color: '#d8d2ba',
							width: 1,
							opacity: 0.7
						}),
						zIndex: 33
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_npier_a_1516': 
			if(zoom >= 16 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#eae6d0',
							color: 'rgba(234, 230, 208, 0.3)'
							//opacity: 0.7
						}),
						stroke: new ol.style.Stroke({
							color: '#d8d2ba',
							width: 1,
							opacity: 0.7
						}),
						zIndex: 32
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_arrfc_1318': 
			if(zoom >= 14 && zoom < 20) {
				var arrfckdSe = f.getProperties()['arrfckd_se'];
				switch(arrfckdSe) {
					case 'PRF011':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#e1e1e1',
								color: 'rgba(225, 225, 225, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#e1e1e1',
								width: 0.4,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF010':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#e1e1e1',
								color: 'rgba(225, 225, 225, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#e1e1e1',
								width: 0.4,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF009':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#e1e1e1',
								color: 'rgba(225, 225, 225, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#e1e1e1',
								width: 0.4,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF008':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF007':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF006':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF005':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF004':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF003':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF002':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eae6d0',
								color: 'rgba(234, 230, 208, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#d8d2ba',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF015':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#e2e2e2',
								color: 'rgba(226, 226, 226, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#c5c4c4',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF012':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eaeaea',
								color: 'rgba(234, 234, 234, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#eaeaea',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF016':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eaeaea',
								color: 'rgba(234, 234, 234, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#eaeaea',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					case 'PRF013':
						styleVal = {
							fill: new ol.style.Fill({
								//color: '#eaeaea',
								color: 'rgba(234, 234, 234, 0.3)'
								//opacity: 0.7
							}),
							stroke: new ol.style.Stroke({
								color: '#e2e2e2',
								width: 1,
								opacity: 0.7
							}),
							zIndex: 31
						};
						return new ol.style.Style(styleVal);
					default:
					return null;
				}
			}
			else {
				return null;
			}
		case 'vl_ex_snr_a_1718': 
			if(zoom >= 18 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f1d481',
							color: 'rgba(244, 243, 241, 0.6)'
							//opacity: 0.7
						}),
						stroke: new ol.style.Stroke({
							color: '#cfcabe',
							width: 1.25,
							opacity: 0.4
						}),
						zIndex: 30
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_snexrd_l_0612': 
			if(zoom >= 7 && zoom < 14) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 13 && s_level == 12) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 7 && s_level == 6) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#d2b86e',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 28
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f1d481',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 29
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_snnahw_l_0712': 
			if(zoom >= 8 && zoom < 14) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 13 && s_level == 12) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#cdba8e',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 26
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#efe0b3',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 27
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_snmainrd_l_0712': 
			if(zoom >= 8 && zoom < 14) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 13 && s_level == 12) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 1;
					inWidth = 0.75;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#e2d3ad',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 24
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f0ebd8',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 25
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_lnexrd_a_1316': 
			if(zoom >= 14 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f1d481',
							color: 'rgba(241, 212, 129, 0.3)'
							//opacity: 0.7
						}),
						zIndex: 23
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_lnnahw_a_1316': 
			if(zoom >= 14 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#efe0b3',
							color: 'rgba(239, 224, 179, 0.3)'
							//opacity: 0.7
						}),
						zIndex: 22
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_lnmainrd_a_1316': 
			if(zoom >= 14 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f0ebd8',
							color: 'rgba(240, 235, 216, 0.3)'
							//opacity: 0.7
						}),
						zIndex: 21
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_lnrd_a_1316': 
			if(zoom >= 14 && zoom < 18) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f4f3f1',
							color: 'rgba(244, 243, 241, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 20
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_snrd_l_1316': 
			if(zoom >= 14 && zoom < 18) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 2.75;
				var inWidth = 1.38;
				var outOpacity = 0.4;
				var inOpacity = 0.4;
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#cfcabe',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 18
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f4f3f1',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 19
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_hwrdcenl_l_0612': 
			if(zoom >= 7 && zoom < 14) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 13 && s_level == 12) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 2;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 7 && s_level == 6) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#d2b86e',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 16
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f1d481',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 17
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_cityhwrdcenl_l_0712': 
			if(zoom >= 8 && zoom < 14) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 13 && s_level == 12) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 2.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 2;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#d2b86e',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 14
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f1d481',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 15
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_nardcenl_l_0713': 
			if(zoom >= 8 && zoom < 15) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 14 && s_level == 13) {
					outWidth = 4;
					inWidth = 2;
					outOpacity = 0.4;
					inOpacity = 0.4;
				}
				else if (zoom == 13 && s_level == 12) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.9;
					inOpacity = 0.9;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 2;
					inWidth = 1;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#cdba8e',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 12
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#efe0b3',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 13
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_localrdcenl_l_0713': 
			if(zoom >= 8 && zoom < 15) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 14 && s_level == 13) {
					outWidth = 4;
					inWidth = 2.5;
					outOpacity = 0.4;
					inOpacity = 0.4;
				}
				else if (zoom == 13 && s_level == 12) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.4;
					inOpacity = 0.4;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 9 && s_level == 8) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else if (zoom == 8 && s_level == 7) {
					outWidth = 1.5;
					inWidth = 0.9;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#decc96',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 10
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#efe7cd',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 11
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_mainrdcenl_l_0913':
			if(zoom >= 10 && zoom < 15) {
				var s_level = parseInt(f.getProperties()['s_level']);
				var outWidth = 0;
				var inWidth = 0;
				var outOpacity = 0;
				var inOpacity = 0;
				if (zoom == 14 && s_level == 13) {
					outWidth = 3;
					inWidth = 1.5;
					outOpacity = 0.4;
					inOpacity = 0.4;
				}
				else if (zoom == 13 && s_level == 12) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.6;
					inOpacity = 0.6;
				}
				else if (zoom == 12 && s_level == 11) {
					outWidth = 1.5;
					inWidth = 0.75;
					outOpacity = 0.6;
					inOpacity = 0.6;				
				}
				else if (zoom == 11 && s_level == 10) {
					outWidth = 1;
					inWidth = 0.7;
					outOpacity = 0.6;
					inOpacity = 0.6;				
				}
				else if (zoom == 10 && s_level == 9) {
					outWidth = 1;
					inWidth = 0.7;
					outOpacity = 0.9;
					inOpacity = 0.9;				
				}
				else {
					return null;
				}
				
				var outStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#e2d3ad',
						width: outWidth,
						opacity: outOpacity,
						lineCap: 'round'
					}),
					zIndex: 8
				});
				var inStyle = new ol.style.Style({
					stroke: new ol.style.Stroke({
						color: '#f0ebd8',
						width: inWidth,
						opacity: inOpacity,
						lineCap: 'round'
					}),
					zIndex: 9
				});
				var styles = [outStyle, inStyle]
				return styles;
			}
			else {
				return null;
			}
		case 'vl_ex_hwrda_a_1318': 
			if(zoom >= 14 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f1d481',
							color: 'rgba(241, 212, 129, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 7
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_cityhwrda_a_1318': 
			if(zoom >= 14 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#ebd285',
							color: 'rgba(235, 210, 133, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 6
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_narda_a_1418': 
			if(zoom >= 15 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#efe0b3',
							color: 'rgba(239, 224, 179, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 5
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_localrda_a_1418': 
			if(zoom >= 15 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#efe7cd',
							color: 'rgba(239, 231, 205, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 4
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_ex_mainrd_a_1418': 
			if(zoom >= 15 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							//color: '#f0ebd8',
							color: 'rgba(240, 235, 216, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 3
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
		case 'vl_rodway_ctln_1214': 
			if(zoom >= 13 && zoom < 16) {
				styleVal = {
						stroke: new ol.style.Stroke({
							color: '#cfcabe',
							width: 0.7,
							opacity: 1
						}),
						zIndex: 2
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null
			}
		case 'vl_rodway_bndry_1518': 
			if(zoom >= 16 && zoom < 20) {
				styleVal = {
						fill: new ol.style.Fill({
							// color: '#f4f3f1',
							color: 'rgba(244, 243, 241, 0.6)'
							//opacity: 0.4
						}),
						zIndex: 1
				};
				return new ol.style.Style(styleVal);
			}
			else {
				return null;
			}
	}
	//return new ol.style.Style(styleVal);
	return null;
}

function getLabel(f, attr) {
	var label = f.getProperties()[attr];
	
	if (label) {
		return label;
	}
	else {
		return '';
	}
}

function offsetGeometry(feature, size) {
    switch (feature.getGeometry().getType()) {
    case 'Polygon':
        var coords = ol.geom.flat.inflate.inflateCoordinates(feature.getFlatCoordinates(), 0, feature.getEnds(), 2, );
        var sign = feature.getGeometry().getLinearRing(0).getArea() < 0 ? -1 : 1;
        coords[0] = ol.coordinate.offsetCoords(coords[0], sign * size);
        return new ol.geom.Polygon(coords);
    case 'LineString':
        var coords = ol.geom.flat.inflate.inflateCoordinates(feature.getFlatCoordinates(), 0, feature.getEnds(), 2, );
        coords = ol.coordinate.offsetCoords(coords, size);
        return new ol.geom.LineString(coords);
    default:
        return feature.getGeometry();
    }
}

function isFeatureRendered(featureId) {
  return renderedFeatures[featureId] === true;
}