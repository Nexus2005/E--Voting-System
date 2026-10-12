pragma solidity 0.5.16;

contract Contest{
	
	struct Contestant{
		uint id;
		string name;
		uint voteCount;
		string party;
		uint age;
		string qualification;
	}

	struct Voter{
		bool hasVoted;
		uint vote;
		bool isRegistered;
	}

	address admin;
	mapping(uint => Contestant) public contestants; 
   // mapping(address => bool) public voters;
    mapping(address => Voter) public voters;
	uint public contestantsCount;
	// uint public counter;
	enum PHASE{reg, voting , done}
	PHASE public state;

	modifier onlyAdmin(){
		require(msg.sender==admin);
		_;
	}
	
	modifier validState(PHASE x){
	    require(state==x);
	    _;
	}

	constructor() public{
		admin=msg.sender;
        state=PHASE.reg;
		// counter = 0;

	}

    function changeState(PHASE x) onlyAdmin public{
        state = x;
    }

	function addContestant(string memory _name , string memory _party , uint _age , string memory _qualification) public onlyAdmin {
		contestantsCount++;
		contestants[contestantsCount]=Contestant(contestantsCount,_name,0,_party,_age,_qualification);
	}

	function deleteContestant(uint _contestantId) public onlyAdmin {
		require(_contestantId > 0 && _contestantId <= contestantsCount, "Invalid contestant ID");
		delete contestants[_contestantId];
	}

	function voterRegisteration(address user) public onlyAdmin {
		voters[user].isRegistered=true;
	}

	function vote(uint _contestantId) public validState(PHASE.voting){
		require(voters[msg.sender].isRegistered, "Voter not registered");
		require(!voters[msg.sender].hasVoted, "Voter already voted");
		require(_contestantId > 0 && _contestantId<=contestantsCount, "Invalid contestant ID");
		require(bytes(contestants[_contestantId].name).length > 0, "Candidate does not exist or was deleted");
		contestants[_contestantId].voteCount++;
		voters[msg.sender].hasVoted=true;
		voters[msg.sender].vote=_contestantId;
	}
}