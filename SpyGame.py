import random
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
app = FastAPI()
app.mount("/static", StaticFiles(directory="."), name="static")
words = ["تمساح", "آفتابه", "شوگر مامی", "سیرابی", "پاریس","طالبان","قهوه", "دانشگاه", "روستا", "بیمارستان", "پاریس","شیراز", " تالار عروسی", "تاج محل", "دفتر ازدواج", "غار اصحاب کهف","پالایشگاه", "ساندویچی", "شهربازی", "آینه بغل", "نهنگ عنبر","شیرفروش", "جادوگر", "پلیس فتا", "ساندویچ فروش", "کلاه بردار","خرس قهوه‌ای", "کفتار راه‌راه", "روستا", "بیمارستان", "تله موش","دفتر خاطرات", "پوشک بچه", "مسواک", "مجری", "نمکدان","جزیره", "ترامپ", "جن گیر", "غول چراغ جادو", "برادر شوهر"]

rooms = {}
@app.get("/")
def home():
    return FileResponse("index.html")
@app.get("/create")
def create_game():
    room_code = random.randint(1000, 9999)
    while room_code in rooms:
        room_code = random.randint(1000, 9999)
        
    rooms[room_code] = {
    "players": [],
    "host": None,
    "spy": None,
    "secret_word": None,
    "started": False,
    "timer_seconds": 300,
    "voting_started": False,
    "votes": {},
    "round": 1,
    "revote_players": [],
    "is_revote": False,
    "vote_version": 1,
    "last_vote_result": None
}
    return {"room_code": room_code}
@app.get("/set-timer/{room_code}/{seconds}")
def set_timer(room_code: int, seconds: int):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    if seconds not in [300, 600, 720, 900]:
        return {"message": "Invalid timer"}

    rooms[room_code]["timer_seconds"] = seconds

    return {
        "message": "Timer updated",
        "timer_seconds": seconds
    }
@app.get("/set-host/{room_code}/{player_name}")
def set_host(room_code: int, player_name: str):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    rooms[room_code]["host"] = player_name

    return {"host": player_name}

@app.get("/join/{room_code}/{player_name}")
def join_game(room_code: int, player_name):
    if room_code not in rooms:
        return {"message": "Room does not exist"}
    room_players = rooms[room_code]["players"]
    if any(player_name.lower() == player.lower() for player in room_players):
        return {"message": "This name is already taken"}
    else:
        room_players.append(player_name)
        return {"player": player_name}
@app.get("/players/{room_code}")
def get_players(room_code: int):
    if room_code not in rooms:
        return {"message": "Room does not exist"}
    return {
    "players": rooms[room_code]["players"],
    "host": rooms[room_code]["host"]
}

@app.get("/start/{room_code}")
def start_game(room_code: int):
    if room_code not in rooms:
        return {"message": "Room does not exist"}
    room_players = rooms[room_code]["players"]
    if len(room_players)  < 3:
        return{"message": "Not enough player to start the game"}
    rooms[room_code]["spy"] = random.choice(room_players)
    rooms[room_code]["secret_word"] = random.choice(words)
    rooms[room_code]["started"] = True
    return {"message": "Game started"}
@app.get("/status/{room_code}")
def get_status(room_code: int):
    if room_code not in rooms:
        return {"message": "Room does not exist"}

    return {
    "started": rooms[room_code]["started"],
    "timer_seconds": rooms[room_code]["timer_seconds"],
    "voting_started": rooms[room_code]["voting_started"],
    "round": rooms[room_code]["round"]
}


@app.get("/role/{room_code}/{player_name}")
def get_role(room_code: int, player_name: str):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    room_players = rooms[room_code]["players"]
    room_spy = rooms[room_code]["spy"]
    room_secret_word = rooms[room_code]["secret_word"]

    matched_player = None

    for player in room_players:
        if player_name.lower() == player.lower():
            matched_player = player
            break

    if room_spy is None:
        return {"message": "Game has not started yet"}

    if matched_player is None:
        return {"message": "Player does not exist"}

    if matched_player == room_spy:
        return {"role": "You are the spy"}
    else:

        return {
            "role": "normal",
            "word": room_secret_word
    }
@app.get("/start-voting/{room_code}")
def start_voting(room_code: int):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    room = rooms[room_code]

    room["voting_started"] = True
    room["votes"] = {}
    room["revote_players"] = []
    room["is_revote"] = False
    room["vote_version"] = 1
    room["last_vote_result"] = None

    return {
        "message": "Voting started",
        "vote_version": room["vote_version"]
    }


@app.get("/vote/{room_code}/{vote_version}/{voter_name}/{voted_for}")
def vote(
    room_code: int,
    vote_version: int,
    voter_name: str,
    voted_for: str
):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    room = rooms[room_code]

    if room["voting_started"] is False:
        return {"message": "Voting has not started"}

    if vote_version != room["vote_version"]:
        return {"message": "This voting round is no longer active"}

    room_players = room["players"]

    if voter_name not in room_players:
        return {"message": "Voter does not exist"}

    if voted_for not in room_players:
        return {"message": "Selected player does not exist"}

    if voter_name == voted_for:
        return {"message": "You cannot vote for yourself"}

    # اگر Revote باشد فقط به افراد مساوی می‌توان رأی داد
    if room["is_revote"]:
        if voted_for not in room["revote_players"]:
            return {"message": "You can only vote for tied players"}
    if voter_name in room["votes"]:
        return {"message": "You have already voted"}
    room["votes"][voter_name] = voted_for

    return {
        "message": "Vote recorded",
        "votes_received": len(room["votes"]),
        "total_players": len(room_players),
        "vote_version": room["vote_version"]
    }
@app.get("/result/{room_code}/{vote_version}")
def get_result(room_code: int, vote_version: int):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    room = rooms[room_code]

    if vote_version != room["vote_version"]:
        return {"message": "Invalid vote version"}

    room_players = room["players"]
    votes = room["votes"]

    # هنوز همه رأی نداده‌اند
    if len(votes) < len(room_players):
        return {
            "ready": False,
            "votes_received": len(votes),
            "total_players": len(room_players)
        }

    # شمارش رأی‌ها
    vote_counts = {}

    for voted_player in votes.values():
        vote_counts[voted_player] = vote_counts.get(voted_player, 0) + 1

    max_votes = max(vote_counts.values())

    top_players = [
        player
        for player, count in vote_counts.items()
        if count == max_votes
    ]

    # اگر رأی‌ها مساوی شدند → Spy wins
    if len(top_players) > 1:
        return {
            "ready": True,
            "tie": True,
            "spy": room["spy"],
            "secret_word": room["secret_word"],
            "winner": "spy"
        }

    # یک نفر بیشترین رأی را گرفته
    accused_player = top_players[0]
    spy = room["spy"]

    agents_win = accused_player == spy

    return {
        "ready": True,
        "tie": False,
        "accused_player": accused_player,
        "spy": spy,
        "secret_word": room["secret_word"],
        "winner": "agents" if agents_win else "spy"
    }

    # ==========================================
    # NORMAL RESULT
    # ==========================================

    accused_player = top_players[0]
    spy = room["spy"]

    agents_win = accused_player == spy

    final_result = {
        "ready": True,
        "tie": False,
        "accused_player": accused_player,
        "spy": spy,
        "secret_word": room["secret_word"],
        "winner": "agents" if agents_win else "spy",
        "vote_version": room["vote_version"]
    }

    room["last_vote_result"] = final_result

    return final_result  
@app.get("/play-again/{room_code}")
def play_again(room_code: int):

    if room_code not in rooms:
        return {"message": "Room does not exist"}

    room = rooms[room_code]

    if len(room["players"]) < 3:
        return {"message": "Not enough players"}

    room["spy"] = random.choice(room["players"])
    room["secret_word"] = random.choice(words)

    room["voting_started"] = False
    room["votes"] = {}
    room["revote_players"] = []
    room["is_revote"] = False
    room["vote_version"] = 1
    room["last_vote_result"] = None
    room["started"] = True
    room["round"] += 1
    return {"message": "New round started"}
# words = ["Pizza", "Airport", "Hospital", "School", "Beach"]
# secret_word = random.choice(words)
# number_of_players = int(input("How many players are playing? \n"))
# players=[]
# for player in range (number_of_players):
#     players_name = input("please enter your name \n")
#     players.append(players_name)
# spy = random.choice(players)

# for player in players:
#      if player != spy:
#         print(secret_word)
#      else:
#          print("Shoma Jasoosi")
  
    
        
        



        
    
