const robot = document.getElementById("robot");
const notifyBtn = document.getElementById("notifyBtn");
const footerMessage = document.getElementById("footerMessage");

function blinkRobot() {
  robot.classList.add("blink");

  setTimeout(() => {
    robot.classList.remove("blink");
  }, 180);
}

function talkRobot() {
  robot.classList.add("talk");

  setTimeout(() => {
    robot.classList.remove("talk");
  }, 500);
}

function randomBlinkLoop() {
  const nextBlink = Math.floor(Math.random() * 2500) + 1800;

  setTimeout(() => {
    blinkRobot();
    randomBlinkLoop();
  }, nextBlink);
}

notifyBtn.addEventListener("mouseenter", () => {
  talkRobot();
});

notifyBtn.addEventListener("click", () => {
  talkRobot();

  footerMessage.textContent =
    "Novidades em breve. Este módulo está sendo preparado para as próximas atualizações do painel.";
});

setInterval(() => {
  talkRobot();
}, 5000);

randomBlinkLoop();