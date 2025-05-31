from fastapi import FastAPI, HTTPException
import httpx
import urllib.parse
import numpy as np
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Mecab 형태소 분석기 임포트 (환경에 따라 아래 중 하나 사용)
# from konlpy.tag import Mecab

app = FastAPI()

API_ENDPOINT = "http://apis.data.go.kr/1140100/minAnalsInfoView5/minSimilarInfo5"
SERVICE_KEY = "/1iwjHt7iRohlMbB6FpiKFkh2dbCo7vvF1Kv742QkTXXjDyz877Y1NZnhjV6gvTeCNV78Jz0i1SvOSLke8JLlw=="

API_ENDPOINT = "http://apis.data.go.kr/1140100/minAnalsInfoView5/minSimilarInfo5"
SERVICE_KEY = "%2F1iwjHt7iRohlMbB6FpiKFkh2dbCo7vvF1Kv742QkTXXjDyz877Y1NZnhjV6gvTeCNV78Jz0i1SvOSLke8JLlw%3D%3D"


@app.get("/minwon")
async def get_minwon(
    startPos: int = 1,
    retCount: int = 5,
    searchword: str = "근로자내일배움카드를 신청했습니다.다음 절차는 어떻게 되나요?",
    target: str = "qna" 
):
    encoded_searchword = urllib.parse.quote(searchword)
    params = {
        "serviceKey": SERVICE_KEY,      # 인증키 (필수)
        "startPos": startPos,           # 페이징 시작 번호 (필수)
        "retCount": retCount,           # 검색 민원 수 (필수)
        "searchword": encoded_searchword,       # 질의문 (필수)
        "target": target                # 분석대상 (필수, 예: qna)
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(API_ENDPOINT, params=params)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        return {"error": str(e), "response": e.response.text}
    except Exception as e:
        return {"error": str(e)}